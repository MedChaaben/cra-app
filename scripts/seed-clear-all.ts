import { createClient } from '@supabase/supabase-js'

import { loadEnv } from './loadEnv'
import { wipeAllStorageObjects } from './storageWipe'

loadEnv()

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url) {
  console.error('Variable manquante : VITE_SUPABASE_URL (ou SUPABASE_URL).')
  process.exit(1)
}
if (!serviceKey) {
  console.error(
    'Variable manquante : SUPABASE_SERVICE_ROLE_KEY (onglet API / Legacy du projet Supabase).\n' +
      'À mettre dans .env.local uniquement — ne jamais la committer ni l’exposer côté client.',
  )
  process.exit(1)
}

const zero = '00000000-0000-0000-0000-000000000000'

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function deleteAllRows(table: string) {
  const { error } = await supabase.from(table).delete().neq('id', zero)
  if (error) throw error
}

async function main() {
  console.log('Suppression des lignes métier (tous les utilisateurs)…')
  await deleteAllRows('invoice_items')
  await deleteAllRows('invoices')
  await deleteAllRows('timesheet_entries')
  await deleteAllRows('timesheets')
  await deleteAllRows('clients')

  console.log('Vidage du stockage (images CRA, logos, PDF factures)…')
  await wipeAllStorageObjects(supabase)

  console.log('Terminé. Les comptes auth, profils et réglages utilisateur sont conservés.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
