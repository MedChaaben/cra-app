import type { ParsedTimesheetRow } from '@/types/models'

export type ParseTableProfile =
  | 'auto'
  | 'excel_screenshot'
  | 'pdf_screenshot'
  | 'paper_photo'
  | 'outlook_table'
  | 'esn_accenture'
  | 'esn_capgemini'
  | 'esn_generic'

export type ParseTableOptions = {
  profile?: ParseTableProfile
}

const DATE_RE = /\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/
const NUMBER_RE = /(\d+[.,]?\d*)/g

function parseNumber(value: string): number {
  const normalized = value.replace(/\s/g, '').replace(',', '.')
  const n = Number.parseFloat(normalized)
  return Number.isFinite(n) ? n : 0
}

function numbersInLine(line: string): number[] {
  const out: number[] = []
  for (const m of line.matchAll(NUMBER_RE)) {
    const n = parseNumber(m[1] ?? '0')
    if (n > 0) out.push(n)
  }
  return out
}

function splitLineCells(line: string, profile: ParseTableProfile): string[] {
  const useTabs =
    profile === 'excel_screenshot' ||
    profile === 'outlook_table' ||
    (profile === 'auto' && line.split('\t').length >= 4)
  if (useTabs && line.includes('\t')) {
    return line.split('\t').map((p) => p.trim()).filter(Boolean)
  }
  return line.split(/\t|\s{2,}|\s*\|\s*/).map((p) => p.trim()).filter(Boolean)
}

function shouldSkipHeaderLine(line: string, profile: ParseTableProfile): boolean {
  const short = line.length < 96
  const generic = /date|mission|client|heure|tjm|total|week|hours|day|staffing|resource|activity|projet|billing|timesheet|feuille|calendar/i.test(
    line,
  )
  if (short && generic) return true

  if (profile === 'outlook_table' || profile === 'auto') {
    if (/^(from|to|subject|sent|de\s*:|à\s*:|objet|envoyé)/i.test(line)) return true
  }
  if (profile === 'esn_accenture' || profile === 'auto') {
    if (/^(activity code|charge code|cp code|employee id|engagement code)/i.test(line)) return true
  }
  if (profile === 'esn_capgemini' || profile === 'esn_generic' || profile === 'auto') {
    if (/^(assignment|engagement|mission id|contract id|purchase order)/i.test(line)) return true
  }
  if (profile === 'pdf_screenshot' && short && /page\s+\d|\d\s*\/\s*\d/.test(line)) return true

  return false
}

export function parseTableText(
  rawText: string,
  baseConfidence: number | null,
  options?: ParseTableOptions,
): ParsedTimesheetRow[] {
  const profile = options?.profile ?? 'auto'
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const rows: ParsedTimesheetRow[] = []

  for (const line of lines) {
    if (shouldSkipHeaderLine(line, profile)) continue

    const parts = splitLineCells(line, profile)
    if (parts.length < 2) continue

    const dateMatch = line.match(DATE_RE)
    const work_date = dateMatch ? normalizeDate(dateMatch[1]) : null

    const nums = numbersInLine(line)
    const hours = nums.length >= 2 ? nums[nums.length - 2]! : nums[0] ?? 0
    const daily_rate = nums.length >= 2 ? nums[nums.length - 1]! : 0

    const project_name = parts[1] ?? parts[0] ?? null
    const client_name = parts[2] ?? null
    const comment = parts.slice(3).join(' ') || null

    const rowConf = rowConfidenceScore(baseConfidence, work_date, hours, daily_rate)

    rows.push({
      work_date,
      project_name,
      client_name,
      hours,
      daily_rate,
      comment,
      ocr_confidence: rowConf,
    })
  }

  return dedupeRows(rows)
}

/** Score 0–100 par ligne à partir du score page Tesseract et d’heuristiques métier. */
export function rowConfidenceScore(
  base: number | null,
  work_date: string | null,
  hours: number,
  daily_rate: number,
): number | null {
  if (base == null || base <= 0) {
    const heur = heuristicOnlyScore(work_date, hours, daily_rate)
    return heur > 0 ? heur : null
  }
  let f = 1
  if (!work_date) f *= 0.88
  if (!(hours > 0)) f *= 0.82
  if (!(daily_rate > 0)) f *= 0.85
  return Math.round(Math.min(100, Math.max(35, base * f)))
}

function heuristicOnlyScore(work_date: string | null, hours: number, daily_rate: number): number {
  let s = 45
  if (work_date) s += 20
  if (hours > 0) s += 18
  if (daily_rate > 0) s += 17
  return Math.min(100, s)
}

function normalizeDate(input: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input
  const m = input.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/)
  if (!m) return null
  const d = Number(m[1])
  const mo = Number(m[2])
  let y = Number(m[3])
  if (y < 100) y += 2000
  if (!d || !mo || !y) return null
  const mm = String(mo).padStart(2, '0')
  const dd = String(d).padStart(2, '0')
  return `${y}-${mm}-${dd}`
}

function dedupeRows(rows: ParsedTimesheetRow[]): ParsedTimesheetRow[] {
  const seen = new Set<string>()
  const out: ParsedTimesheetRow[] = []
  for (const r of rows) {
    const key = [r.work_date, r.project_name, r.hours, r.daily_rate].join('|')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

export function aggregateRowsConfidence(rows: ParsedTimesheetRow[]): number | null {
  const vals = rows.map((r) => r.ocr_confidence).filter((c): c is number => typeof c === 'number' && c > 0)
  if (!vals.length) return null
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}

export function shouldRequireHumanReview(
  rows: ParsedTimesheetRow[],
  pageConfidence: number | null,
): { required: boolean; reason?: string } {
  if (rows.length === 0) {
    return { required: true, reason: 'no_rows' }
  }
  const avg = aggregateRowsConfidence(rows)
  if (avg != null && avg < 62) {
    return { required: true, reason: 'low_avg_confidence' }
  }
  if (pageConfidence != null && pageConfidence > 0 && pageConfidence < 55) {
    return { required: true, reason: 'low_page_confidence' }
  }
  const weakRows = rows.filter((r) => (r.ocr_confidence ?? 100) < 48).length
  if (weakRows >= Math.max(2, Math.ceil(rows.length * 0.35))) {
    return { required: true, reason: 'many_weak_rows' }
  }
  return { required: false }
}
