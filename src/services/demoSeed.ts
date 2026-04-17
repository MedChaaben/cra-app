import { supabase } from '@/lib/supabase/client'
import { insertDemoDataset } from '@/services/demoSeedCore'

export async function seedDemoDataForUser(userId: string) {
  return insertDemoDataset(supabase, userId)
}
