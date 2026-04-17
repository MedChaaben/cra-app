import { useQuery } from '@tanstack/react-query'
import { endOfMonth, format, startOfMonth } from 'date-fns'

import { supabase } from '@/lib/supabase/client'

export type DashboardStats = {
  hoursMonth: number
  revenueMonthHt: number
  timesheetCount: number
  invoiceCount: number
}

export function useDashboardStats(userId: string | undefined) {
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd')

  return useQuery({
    queryKey: ['dashboard-stats', userId, monthStart, monthEnd],
    enabled: Boolean(userId),
    queryFn: async (): Promise<DashboardStats> => {
      const { data: sheets, error: sErr } = await supabase.from('timesheets').select('id').eq('user_id', userId!)
      if (sErr) throw sErr
      const sheetIds = (sheets ?? []).map((s) => s.id as string)
      const timesheetCount = sheetIds.length

      let hoursMonth = 0
      let revenueMonthHt = 0

      if (sheetIds.length > 0) {
        const { data: entries, error: eErr } = await supabase
          .from('timesheet_entries')
          .select('hours, daily_rate, work_date, timesheet_id')
          .in('timesheet_id', sheetIds)
        if (eErr) throw eErr
        for (const e of entries ?? []) {
          const d = e.work_date as string | null
          if (!d || d < monthStart || d > monthEnd) continue
          const h = Number(e.hours) || 0
          const rate = Number(e.daily_rate) || 0
          hoursMonth += h
          revenueMonthHt += h * rate
        }
      }

      const { count: invoiceCount, error: iErr } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId!)
      if (iErr) throw iErr

      return {
        hoursMonth,
        revenueMonthHt,
        timesheetCount,
        invoiceCount: invoiceCount ?? 0,
      }
    },
  })
}
