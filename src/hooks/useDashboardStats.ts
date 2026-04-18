import { useQuery } from '@tanstack/react-query'

import {
  buildReportingDashboardMetrics,
  type RawEntryRow,
  type RawInvoiceRow,
  type ReportingDashboardMetrics,
} from '@/lib/dashboardMetrics'
import {
  resolveReportingRange,
  timesheetMatchesReportingRange,
  type ReportingPeriodState,
} from '@/lib/reportingPeriod'
import { supabase } from '@/lib/supabase/client'

export type { ReportingDashboardMetrics }

type EntryWithSheet = RawEntryRow & { timesheet_id: string }

export function useDashboardStats(
  userId: string | undefined,
  period: ReportingPeriodState,
  clientId: string | null,
) {
  const periodKey = JSON.stringify({ period, clientId })

  return useQuery({
    queryKey: ['dashboard-stats', userId, periodKey],
    enabled: Boolean(userId),
    queryFn: async (): Promise<ReportingDashboardMetrics> => {
      const now = new Date()
      const range = resolveReportingRange(period, now)

      const [{ data: sheets, error: sErr }, { data: clients, error: clErr }] = await Promise.all([
        supabase.from('timesheets').select('id, created_at, month_year').eq('user_id', userId!),
        supabase.from('clients').select('id, name').eq('user_id', userId!),
      ])
      if (sErr) throw sErr
      if (clErr) throw clErr

      const clientNames = new Map<string, string>()
      for (const c of clients ?? []) {
        clientNames.set(c.id as string, String((c as { name: string }).name))
      }

      const sheetList = (sheets ?? []) as { id: string; created_at: string; month_year: string | null }[]
      const sheetIds = sheetList.map((s) => s.id)

      let entriesWithSheet: EntryWithSheet[] = []
      if (sheetIds.length > 0) {
        const { data: ent, error: eErr } = await supabase
          .from('timesheet_entries')
          .select('id, timesheet_id, hours, daily_rate, work_date, client_id, client_name')
          .in('timesheet_id', sheetIds)
        if (eErr) throw eErr
        entriesWithSheet = (ent ?? []) as EntryWithSheet[]
      }

      const timesheetIdsInPeriod = new Set<string>()
      for (const ts of sheetList) {
        const sheetEntries = entriesWithSheet.filter((e) => e.timesheet_id === ts.id)
        const datesForMatch = clientId
          ? sheetEntries.filter((e) => e.client_id === clientId).map((e) => e.work_date)
          : sheetEntries.map((e) => e.work_date)
        if (timesheetMatchesReportingRange(ts, datesForMatch, range)) {
          timesheetIdsInPeriod.add(ts.id)
        }
      }

      let entriesForMetrics: RawEntryRow[] = entriesWithSheet.map((e) => {
        const { timesheet_id: _tid, ...row } = e
        void _tid
        return row as RawEntryRow
      })
      if (clientId) {
        entriesForMetrics = entriesForMetrics.filter((e) => e.client_id === clientId)
      }

      const { data: invoices, error: invErr } = await supabase
        .from('invoices')
        .select('id, client_id, issue_date, due_date, status, total_ttc, subtotal_ht')
        .eq('user_id', userId!)
      if (invErr) throw invErr

      let invRows = (invoices ?? []) as RawInvoiceRow[]
      if (clientId) {
        invRows = invRows.filter((i) => i.client_id === clientId)
      }

      const invIds = invRows.map((i) => i.id)
      const invoicedEntryIds = new Set<string>()
      if (invIds.length > 0) {
        const { data: items, error: itErr } = await supabase
          .from('invoice_items')
          .select('timesheet_entry_id')
          .in('invoice_id', invIds)
          .not('timesheet_entry_id', 'is', null)
        if (itErr) throw itErr
        for (const row of items ?? []) {
          const id = (row as { timesheet_entry_id: string | null }).timesheet_entry_id
          if (id) invoicedEntryIds.add(id)
        }
      }

      return buildReportingDashboardMetrics(
        now,
        range,
        entriesForMetrics,
        invRows,
        invoicedEntryIds,
        clientNames,
        timesheetIdsInPeriod,
      )
    },
  })
}
