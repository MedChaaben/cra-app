import { createClient } from '@supabase/supabase-js'

import { insertBulkConsultingDemo } from '../src/services/demoBulkSeed'
import { loadEnv } from './loadEnv'
import { wipeStorageForUser } from './storageWipe'

loadEnv()

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const defaultEmail = 'chaaben.mo@gmail.com'
const email = process.argv[2] ?? process.env.SEED_DEMO_EMAIL ?? defaultEmail

if (!url) {
  console.error('Variable manquante : VITE_SUPABASE_URL (ou SUPABASE_URL).')
  process.exit(1)
}
if (!serviceKey) {
  console.error('Variable manquante : SUPABASE_SERVICE_ROLE_KEY (voir .env.example).')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function findUserIdByEmail(target: string): Promise<string | null> {
  const perPage = 1000
  let page = 1
  const normalized = target.trim().toLowerCase()
  while (page <= 500) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const found = data.users.find((u) => u.email?.toLowerCase() === normalized)
    if (found) return found.id
    if (data.users.length < perPage) return null
    page += 1
  }
  return null
}

async function clearUserBusinessData(userId: string) {
  const { error: iErr } = await supabase.from('invoices').delete().eq('user_id', userId)
  if (iErr) throw iErr
  const { error: tErr } = await supabase.from('timesheets').delete().eq('user_id', userId)
  if (tErr) throw tErr
  const { error: cErr } = await supabase.from('clients').delete().eq('user_id', userId)
  if (cErr) throw cErr
  await wipeStorageForUser(supabase, userId)
}

async function main() {
  console.log(`Recherche du compte ${email}…`)
  const userId = await findUserIdByEmail(email)
  if (!userId) {
    console.error(`Aucun utilisateur avec l’email « ${email} ». Créez d’abord le compte.`)
    process.exit(1)
  }

  console.log('Nettoyage des données métier + stockage pour cet utilisateur…')
  await clearUserBusinessData(userId)

  console.log('Insertion démo volumineuse (36 mois CRA + factures, 600 €/j, 2 clients, vacances + interco 2025)…')
  await insertBulkConsultingDemo(supabase, userId)

  console.log(`OK — jeu de données bulk inséré pour ${email} (${userId}).`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
