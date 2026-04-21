import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase/client'
import type { Timesheet } from '@/types/models'

export type TimesheetWithEntryHours = Timesheet & {
  timesheet_entries: { work_date: string | null; hours: number }[] | null
}

export function useTimesheets(userId: string | undefined) {
  return useQuery({
    queryKey: ['timesheets', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<TimesheetWithEntryHours[]> => {
      const { data, error } = await supabase
        .from('timesheets')
        .select('*, timesheet_entries(work_date, hours)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as TimesheetWithEntryHours[]
    },
  })
}
