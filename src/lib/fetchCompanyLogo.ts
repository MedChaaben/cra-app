import type { SupabaseClient } from '@supabase/supabase-js'

/** Télécharge le logo société (bucket `company-logos`) pour intégration PDF. */
export async function fetchCompanyLogoBytes(
  supabase: SupabaseClient,
  userId: string,
  logoPath: string | null | undefined,
): Promise<Uint8Array | null> {
  const raw = logoPath?.trim()
  if (!raw) return null
  const path = raw.includes('/') ? raw.replace(/^\/+/, '') : `${userId}/${raw.replace(/^\/+/, '')}`
  const { data, error } = await supabase.storage.from('company-logos').download(path)
  if (error || !data) return null
  return new Uint8Array(await data.arrayBuffer())
}
