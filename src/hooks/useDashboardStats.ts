import { useQuery } from '@tanstack/react-query'

import { buildDashboardMetrics, type RawEntryRow, type RawInvoiceRow } from '@/lib/dashboardMetrics'
import { supabase } from '@/lib/supabase/client'

export type { DashboardMetrics } from '@/lib/dashboardMetrics'

export function useDashboardStats(userId: string | undefined) {
  const periodKey = new Date().toISOString().slice(0, 7)

  return useQuery({
    queryKey: ['dashboard-stats', userId, periodKey],
    enabled: Boolean(userId),
    queryFn: async () => {
      const now = new Date()

      const [{ data: sheets, error: sErr }, { count: invoiceCount, error: cInvErr }] = await Promise.all([
        supabase.from('timesheets').select('id').eq('user_id', userId!),
        supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('user_id', userId!),
      ])
      if (sErr) throw sErr
      if (cInvErr) throw cInvErr

      const sheetIds = (sheets ?? []).map((s) => s.id as string)
      const timesheetCount = sheetIds.length

      const [{ data: clients, error: clErr }, { data: invoices, error: invErr }] = await Promise.all([
        supabase.from('clients').select('id, name').eq('user_id', userId!),
        supabase.from('invoices').select('id, client_id, due_date, status, total_ttc').eq('user_id', userId!),
      ])
      if (clErr) throw clErr
      if (invErr) throw invErr

      const clientNames = new Map<string, string>()
      for (const c of clients ?? []) {
        clientNames.set(c.id as string, String((c as { name: string }).name))
      }

      let entries: RawEntryRow[] = []
      if (sheetIds.length > 0) {
        const { data: ent, error: eErr } = await supabase
          .from('timesheet_entries')
          .select('id, hours, daily_rate, work_date, client_id, client_name')
          .in('timesheet_id', sheetIds)
        if (eErr) throw eErr
        entries = (ent ?? []) as RawEntryRow[]
      }

      const invRows = (invoices ?? []) as RawInvoiceRow[]
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

      return buildDashboardMetrics(
        now,
        entries,
        invRows,
        invoicedEntryIds,
        clientNames,
        timesheetCount,
        invoiceCount ?? 0,
      )
    },
  })
}
