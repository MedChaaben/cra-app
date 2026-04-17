import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase/client'
import type { Timesheet } from '@/types/models'

export function useTimesheets(userId: string | undefined) {
  return useQuery({
    queryKey: ['timesheets', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Timesheet[]> => {
      const { data, error } = await supabase
        .from('timesheets')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Timesheet[]
    },
  })
}
