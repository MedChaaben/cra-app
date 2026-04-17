import type { ParsedTimesheetRow } from '@/types/models'

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

export function parseTableText(rawText: string, baseConfidence: number | null): ParsedTimesheetRow[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const rows: ParsedTimesheetRow[] = []

  for (const line of lines) {
    if (/date|mission|client|heure|tjm|total/i.test(line) && line.length < 80) continue

    const parts = line.split(/\t|\s{2,}|\s*\|\s*/).map((p) => p.trim())
    if (parts.length < 2) continue

    const dateMatch = line.match(DATE_RE)
    const work_date = dateMatch ? normalizeDate(dateMatch[1]) : null

    const nums = numbersInLine(line)
    const hours = nums.length >= 2 ? nums[nums.length - 2]! : nums[0] ?? 0
    const daily_rate = nums.length >= 2 ? nums[nums.length - 1]! : 0

    const project_name = parts[1] ?? parts[0] ?? null
    const client_name = parts[2] ?? null
    const comment = parts.slice(3).join(' ') || null

    rows.push({
      work_date,
      project_name,
      client_name,
      hours,
      daily_rate,
      comment,
      ocr_confidence: baseConfidence,
    })
  }

  return dedupeRows(rows)
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
