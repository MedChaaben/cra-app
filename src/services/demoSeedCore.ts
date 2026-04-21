import type { SupabaseClient } from '@supabase/supabase-js'

/** Données de démo (clients + CRA + lignes). À utiliser avec un client Supabase déjà authentifié (navigateur ou service_role). */
export async function insertDemoDataset(supabase: SupabaseClient, userId: string) {
  const clients = [
    {
      user_id: userId,
      name: 'Acme Corp',
      email: 'finance@acme.test',
      address: '10 rue de la Paix\n75002 Paris',
      vat_number: 'FR12345678901',
    },
    {
      user_id: userId,
      name: 'Studio Nova',
      email: 'hello@nova.test',
      address: '22 avenue des Champs\n69000 Lyon',
      vat_number: 'FR99887766554',
    },
  ]

  const { data: insertedClients, error: cErr } = await supabase.from('clients').insert(clients).select()
  if (cErr) throw cErr

  const clientA = insertedClients?.[0]
  if (!clientA) return

  const { data: ts, error: tErr } = await supabase
    .from('timesheets')
    .insert({
      user_id: userId,
      title: 'CRA Avril (démo)',
      status: 'parsed',
      month_year: '2026-04',
    })
    .select()
    .single()
  if (tErr) throw tErr

  const entries = [
    {
      timesheet_id: ts.id,
      work_date: '2026-04-01',
      project_name: 'Audit technique',
      client_name: clientA.name,
      client_id: clientA.id,
      hours: 1,
      daily_rate: 650,
      comment: 'Atelier architecture',
      sort_order: 0,
    },
    {
      timesheet_id: ts.id,
      work_date: '2026-04-02',
      project_name: 'Mise en prod',
      client_name: clientA.name,
      client_id: clientA.id,
      hours: 0.5,
      daily_rate: 650,
      comment: '',
      sort_order: 1,
    },
  ]

  const { error: eErr } = await supabase.from('timesheet_entries').insert(entries)
  if (eErr) throw eErr
}
