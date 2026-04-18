import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase/client'
import type { Client } from '@/types/models'

export function useClients(userId: string | undefined) {
  return useQuery({
    queryKey: ['clients', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Client[]> => {
      const { data, error } = await supabase.from('clients').select('*').eq('user_id', userId!).order('name')
      if (error) throw error
      return (data ?? []) as Client[]
    },
  })
}
