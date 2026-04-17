import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKETS = ['timesheet-images', 'company-logos', 'invoices-pdf'] as const

function isFolder(entry: { metadata: Record<string, unknown> | null }): boolean {
  return entry.metadata === null
}

/** Liste récursive des chemins de fichiers (pas les dossiers) sous `prefix`. */
async function listFilePaths(
  supabase: SupabaseClient,
  bucket: (typeof BUCKETS)[number],
  prefix: string,
): Promise<string[]> {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 })
  if (error) throw error
  if (!data?.length) return []

  const paths: string[] = []
  for (const item of data) {
    const path = prefix ? `${prefix}/${item.name}` : item.name
    if (isFolder(item)) {
      paths.push(...(await listFilePaths(supabase, bucket, path)))
    } else {
      paths.push(path)
    }
  }
  return paths
}

async function removePathsInChunks(
  supabase: SupabaseClient,
  bucket: (typeof BUCKETS)[number],
  paths: string[],
) {
  const chunk = 100
  for (let i = 0; i < paths.length; i += chunk) {
    const slice = paths.slice(i, i + chunk)
    const { error } = await supabase.storage.from(bucket).remove(slice)
    if (error) throw error
  }
}

/** Supprime tous les objets des buckets applicatifs. */
export async function wipeAllStorageObjects(supabase: SupabaseClient) {
  for (const bucket of BUCKETS) {
    const paths = await listFilePaths(supabase, bucket, '')
    if (paths.length) await removePathsInChunks(supabase, bucket, paths)
  }
}

/** Supprime les fichiers dont le chemin commence par `userId/` dans chaque bucket. */
export async function wipeStorageForUser(supabase: SupabaseClient, userId: string) {
  const rootPrefix = userId
  for (const bucket of BUCKETS) {
    const paths = await listFilePaths(supabase, bucket, rootPrefix)
    if (paths.length) await removePathsInChunks(supabase, bucket, paths)
  }
}
