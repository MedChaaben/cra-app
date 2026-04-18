import type { SupabaseClient } from '@supabase/supabase-js'

const TJM = 600
const VAT = 20

/** 36 mois : avr. 2023 → mars 2026 (inclus). */
const START = { y: 2023, m: 4 }
const END = { y: 2026, m: 3 }

const MONTH_NAMES_FR = [
  '',
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
]

/** Jours fériés France métro (hors week-end) — démo déterministe. */
const FR_HOLIDAY = new Set<string>([
  '2023-01-01',
  '2023-04-10',
  '2023-05-01',
  '2023-05-08',
  '2023-05-18',
  '2023-05-29',
  '2023-07-14',
  '2023-08-15',
  '2023-11-01',
  '2023-11-11',
  '2023-12-25',
  '2024-01-01',
  '2024-04-01',
  '2024-05-01',
  '2024-05-08',
  '2024-05-09',
  '2024-05-20',
  '2024-07-14',
  '2024-08-15',
  '2024-11-01',
  '2024-11-11',
  '2024-12-25',
  '2025-01-01',
  '2025-04-21',
  '2025-05-01',
  '2025-05-08',
  '2025-05-29',
  '2025-06-09',
  '2025-07-14',
  '2025-08-15',
  '2025-11-01',
  '2025-11-11',
  '2025-12-25',
  '2026-01-01',
  '2026-04-06',
  '2026-05-01',
  '2026-05-08',
  '2026-05-14',
  '2026-05-25',
  '2026-07-14',
  '2026-08-15',
  '2026-11-01',
  '2026-11-11',
  '2026-12-25',
])

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`
}

function isWeekend(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const w = dt.getUTCDay()
  return w === 0 || w === 6
}

function isVacationBlock(iso: string): boolean {
  const t = Date.parse(`${iso}T12:00:00Z`)
  const blocks: [number, number][] = [
    [Date.parse('2024-08-12T00:00:00Z'), Date.parse('2024-08-16T23:59:59Z')],
    [Date.parse('2025-08-04T00:00:00Z'), Date.parse('2025-08-08T23:59:59Z')],
    [Date.parse('2025-12-22T00:00:00Z'), Date.parse('2025-12-31T23:59:59Z')],
  ]
  return blocks.some(([a, b]) => t >= a && t <= b)
}

/** Intercontrat 2025 : ~7 semaines, quasi pas de facturable (2 demi-journées + 1 jour). */
function intercoHours(iso: string): number | null {
  const t = Date.parse(`${iso}T12:00:00Z`)
  const start = Date.parse('2025-06-16T00:00:00Z')
  const end = Date.parse('2025-08-03T23:59:59Z')
  if (t < start || t > end) return null
  if (iso === '2025-06-20') return 0.5
  if (iso === '2025-07-04') return 1
  if (iso === '2025-07-18') return 0.5
  return 0
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

function* eachMonth(): Generator<{ y: number; m: number; label: string; monthYear: string }> {
  let y = START.y
  let m = START.m
  for (;;) {
    yield {
      y,
      m,
      label: `${MONTH_NAMES_FR[m]} ${y}`,
      monthYear: `${y}-${pad(m)}`,
    }
    if (y === END.y && m === END.m) break
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
}

function billableHoursForDay(iso: string): number {
  if (isWeekend(iso)) return 0
  if (FR_HOLIDAY.has(iso)) return 0
  if (isVacationBlock(iso)) return 0
  const ic = intercoHours(iso)
  if (ic !== null) return ic
  return 1
}

function buildEntriesForMonth(
  timesheetId: string,
  clientId: string,
  clientName: string,
  y: number,
  month: number,
  sortBase: number,
): { entries: object[]; totalHours: number; totalHt: number } {
  const entries: object[] = []
  let totalHours = 0
  const last = lastDayOfMonth(y, month)
  let order = 0
  for (let d = 1; d <= last; d += 1) {
    const iso = toIso(y, month, d)
    const h = billableHoursForDay(iso)
    if (h <= 0) continue
    totalHours += h
    entries.push({
      timesheet_id: timesheetId,
      work_date: iso,
      project_name: 'Delivery / régie T&M',
      client_name: clientName,
      client_id: clientId,
      hours: h,
      daily_rate: TJM,
      comment: h < 1 ? 'Demi-journée' : null,
      ocr_confidence: null,
      sort_order: sortBase + order,
    })
    order += 1
  }
  const totalHt = Math.round(totalHours * TJM * 100) / 100
  return { entries, totalHours, totalHt }
}

/**
 * Démo volumineuse : 2 clients, ~36 mois de CRA (consultant IT ~600 €/j),
 * vacances ponctuelles, creux intercontrat ~7 semaines en 2025,
 * une facture par mois (HT + TVA).
 */
export async function insertBulkConsultingDemo(supabase: SupabaseClient, userId: string) {
  const clients = [
    {
      user_id: userId,
      name: 'Banque Horizon SI',
      email: 'facturation@horizon-si.test',
      address: '12 place de la Défense\n92800 Puteaux',
      vat_number: 'FR44123456789',
      billing_notes: 'Client mission longue durée.',
    },
    {
      user_id: userId,
      name: 'RetailTech Solutions',
      email: 'ap@retailtech.test',
      address: '5 cours Vitton\n69006 Lyon',
      vat_number: 'FR55987654321',
      billing_notes: 'Mission ponctuelle e-commerce.',
    },
  ]

  const { data: insertedClients, error: cErr } = await supabase.from('clients').insert(clients).select()
  if (cErr) throw cErr
  const c0 = insertedClients?.[0]
  const c1 = insertedClients?.[1]
  if (!c0 || !c1) throw new Error('Clients non insérés')

  const timesheetRows: { user_id: string; title: string; status: string; month_year: string }[] = []
  const monthMeta: { y: number; m: number; label: string; monthYear: string; clientIdx: number }[] = []
  let idx = 0
  for (const mo of eachMonth()) {
    const clientIdx = idx % 2
    monthMeta.push({ ...mo, clientIdx })
    timesheetRows.push({
      user_id: userId,
      title: `CRA ${mo.label}`,
      status: 'validated',
      month_year: mo.monthYear,
    })
    idx += 1
  }

  const { data: tsInserted, error: tsErr } = await supabase
    .from('timesheets')
    .insert(timesheetRows)
    .select('id, month_year')
    .order('month_year', { ascending: true })
  if (tsErr) throw tsErr
  if (!tsInserted || tsInserted.length !== monthMeta.length) throw new Error('Timesheets incomplets')
  const sortedTs = [...tsInserted].sort((a, b) => String(a.month_year).localeCompare(String(b.month_year)))

  const allEntries: object[] = []
  const monthTotals: { totalHours: number; totalHt: number; tsId: string; clientId: string }[] = []

  for (let i = 0; i < monthMeta.length; i += 1) {
    const mo = monthMeta[i]!
    const tsId = (sortedTs[i] as { id: string }).id
    const client = mo.clientIdx === 0 ? c0 : c1
    const { entries, totalHours, totalHt } = buildEntriesForMonth(
      tsId,
      client.id,
      client.name,
      mo.y,
      mo.m,
      0,
    )
    allEntries.push(...entries)
    monthTotals.push({ totalHours, totalHt, tsId, clientId: client.id })
  }

  const chunk = 400
  for (let i = 0; i < allEntries.length; i += chunk) {
    const slice = allEntries.slice(i, i + chunk)
    const { error: eErr } = await supabase.from('timesheet_entries').insert(slice)
    if (eErr) throw eErr
  }

  const invoiceRows: object[] = []
  let seq = 1
  for (let i = 0; i < monthTotals.length; i += 1) {
    const mo = monthMeta[i]!
    const { totalHt, clientId } = monthTotals[i]!
    const issueDay = lastDayOfMonth(mo.y, mo.m)
    const issueDate = toIso(mo.y, mo.m, issueDay)
    const [iy, im, id] = issueDate.split('-').map(Number)
    const due = new Date(Date.UTC(iy, im - 1, id + 30))
    const dueDate = toIso(due.getUTCFullYear(), due.getUTCMonth() + 1, due.getUTCDate())
    const vatAmount = Math.round(totalHt * (VAT / 100) * 100) / 100
    const totalTtc = Math.round((totalHt + vatAmount) * 100) / 100
    const status = i >= monthTotals.length - 3 ? 'pending' : 'paid'

    invoiceRows.push({
      user_id: userId,
      client_id: clientId,
      invoice_number: `FAC-${String(seq).padStart(4, '0')}`,
      issue_date: issueDate,
      due_date: dueDate,
      currency: 'EUR',
      vat_rate: VAT,
      notes: mo.y === 2025 && mo.m >= 6 && mo.m <= 8 ? 'Période avec intercontrat partiel (juin–août).' : null,
      status,
      pdf_path: null,
      subtotal_ht: totalHt,
      vat_amount: vatAmount,
      total_ttc: totalTtc,
      pdf_locale: 'fr',
      pdf_template: 'consultant_it',
    })
    seq += 1
  }

  const { data: invInserted, error: invErr } = await supabase
    .from('invoices')
    .insert(invoiceRows)
    .select('id, subtotal_ht, issue_date')
    .order('issue_date', { ascending: true })
  if (invErr) throw invErr
  if (!invInserted || invInserted.length !== invoiceRows.length) throw new Error('Factures incomplètes')
  const sortedInv = [...invInserted].sort((a, b) =>
    String((a as { issue_date: string }).issue_date).localeCompare(
      String((b as { issue_date: string }).issue_date),
    ),
  )

  const itemRows: object[] = []
  for (let i = 0; i < sortedInv.length; i += 1) {
    const mo = monthMeta[i]!
    const inv = sortedInv[i] as { id: string; subtotal_ht: number }
    const { totalHours, totalHt } = monthTotals[i]!
    itemRows.push({
      invoice_id: inv.id,
      description: `Prestations régie T&M — ${mo.monthYear} (${MONTH_NAMES_FR[mo.m]} ${mo.y})`,
      quantity: totalHours,
      unit_price: TJM,
      total_ht: totalHt,
      billing_unit: 'day',
      timesheet_entry_id: null,
    })
  }

  const { error: itErr } = await supabase.from('invoice_items').insert(itemRows)
  if (itErr) throw itErr

  const { error: sErr } = await supabase
    .from('settings')
    .update({ next_invoice_sequence: seq })
    .eq('user_id', userId)
  if (sErr) throw sErr
}
