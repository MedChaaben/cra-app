import {
  endOfMonth,
  endOfQuarter,
  endOfYear,
  format,
  parseISO,
  startOfQuarter,
  startOfYear,
  isValid,
} from 'date-fns'

export type ReportingPreset = 'all' | 'year' | 'quarter' | 'custom'

export type ReportingPeriodState = {
  preset: ReportingPreset
  /** Année civile (preset year / quarter) */
  year: number
  /** 1–4 (preset quarter) */
  quarter: 1 | 2 | 3 | 4
  /** yyyy-MM-dd */
  customFrom: string
  customTo: string
}

export const DEFAULT_REPORTING_PERIOD: ReportingPeriodState = {
  preset: 'year',
  year: new Date().getFullYear(),
  quarter: Math.floor(new Date().getMonth() / 3) + 1 as 1 | 2 | 3 | 4,
  customFrom: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'),
  customTo: format(new Date(), 'yyyy-MM-dd'),
}

export type ClosedDateRange = { start: string; end: string }

/** `null` = pas de borne (tout l’historique). */
export function resolveReportingRange(state: ReportingPeriodState, now: Date): ClosedDateRange | null {
  if (state.preset === 'all') return null

  if (state.preset === 'year') {
    const y = state.year
    const start = format(startOfYear(new Date(y, 0, 1)), 'yyyy-MM-dd')
    const end = format(endOfYear(new Date(y, 0, 1)), 'yyyy-MM-dd')
    return { start, end }
  }

  if (state.preset === 'quarter') {
    const month = (state.quarter - 1) * 3
    const anchor = new Date(state.year, month, 1)
    const start = format(startOfQuarter(anchor), 'yyyy-MM-dd')
    const end = format(endOfQuarter(anchor), 'yyyy-MM-dd')
    return { start, end }
  }

  const from = state.customFrom.trim()
  const to = state.customTo.trim()
  if (!from || !to) {
    const start = format(startOfYear(now), 'yyyy-MM-dd')
    const end = format(now, 'yyyy-MM-dd')
    return { start, end }
  }
  let start = from
  let end = to
  if (start > end) {
    const tmp = start
    start = end
    end = tmp
  }
  return { start, end }
}

export function dateInRange(d: string | null | undefined, range: ClosedDateRange | null): boolean {
  if (!d) return false
  if (!range) return true
  return d >= range.start && d <= range.end
}

export function isoDateInRange(iso: string | null | undefined, range: ClosedDateRange | null): boolean {
  if (!iso) return false
  const day = iso.slice(0, 10)
  return dateInRange(day, range)
}

export function monthsSpannedInclusive(range: ClosedDateRange): number {
  const s = parseISO(range.start)
  const e = parseISO(range.end)
  if (!isValid(s) || !isValid(e)) return 1
  const yDiff = e.getFullYear() - s.getFullYear()
  const mDiff = e.getMonth() - s.getMonth()
  return Math.max(1, yDiff * 12 + mDiff + 1)
}

export function isFullCalendarYear(range: ClosedDateRange, year: number): boolean {
  const yStart = format(startOfYear(new Date(year, 0, 1)), 'yyyy-MM-dd')
  const yEnd = format(endOfYear(new Date(year, 0, 1)), 'yyyy-MM-dd')
  return range.start === yStart && range.end === yEnd
}

export type ReportingSearchParams = {
  p?: string
  y?: string
  q?: string
  from?: string
  to?: string
  query?: string
  client?: string
  status?: string
}

export function reportingStateFromSearchParams(
  sp: URLSearchParams,
  now: Date = new Date(),
): ReportingPeriodState {
  const base = { ...DEFAULT_REPORTING_PERIOD, year: now.getFullYear(), quarter: (Math.floor(now.getMonth() / 3) + 1) as 1 | 2 | 3 | 4 }
  const presetRaw = sp.get('p')
  const preset: ReportingPreset =
    presetRaw === 'all' || presetRaw === 'year' || presetRaw === 'quarter' || presetRaw === 'custom'
      ? presetRaw
      : 'year'

  const y = Number(sp.get('y'))
  const year = Number.isFinite(y) && y >= 1970 && y <= 2100 ? y : now.getFullYear()

  const qn = Number(sp.get('q'))
  const quarter = (qn >= 1 && qn <= 4 ? qn : base.quarter) as 1 | 2 | 3 | 4

  const from = sp.get('from')?.trim() || base.customFrom
  const to = sp.get('to')?.trim() || base.customTo

  return { preset, year, quarter, customFrom: from, customTo: to }
}

export function timesheetMatchesReportingRange(
  ts: { created_at: string; month_year: string | null },
  entryWorkDates: (string | null | undefined)[],
  range: ClosedDateRange | null,
): boolean {
  if (!range) return true
  const created = ts.created_at.slice(0, 10)
  if (created >= range.start && created <= range.end) return true
  const my = ts.month_year?.trim()
  if (my && /^\d{4}-\d{2}$/.test(my)) {
    const [y, m] = my.split('-').map(Number)
    const first = format(new Date(y, m - 1, 1), 'yyyy-MM-dd')
    const last = format(endOfMonth(new Date(y, m - 1, 1)), 'yyyy-MM-dd')
    if (!(last < range.start || first > range.end)) return true
  }
  for (const d of entryWorkDates) {
    if (dateInRange(d ?? null, range)) return true
  }
  return false
}

export type ListReportingUrlSlice = {
  period: ReportingPeriodState
  query: string
  clientId: string | null
  invoiceStatus: string
  timesheetStatus: string
}

export function listReportingFromSearchParams(sp: URLSearchParams, now = new Date()): ListReportingUrlSlice {
  const invst = sp.get('invst')
  const invoiceStatus =
    invst === 'pending' || invst === 'paid' || invst === 'archived' || invst === 'all' ? invst : 'all'
  const tsst = sp.get('tsst')
  const timesheetStatus =
    tsst === 'draft' || tsst === 'parsed' || tsst === 'validated' || tsst === 'all' ? tsst : 'all'
  return {
    period: reportingStateFromSearchParams(sp, now),
    query: sp.get('query') ?? '',
    clientId: sp.get('client') || null,
    invoiceStatus,
    timesheetStatus,
  }
}

export function listReportingToSearchParams(slice: ListReportingUrlSlice): string {
  const p = new URLSearchParams()
  const state = slice.period
  p.set('p', state.preset)
  if (state.preset === 'year' || state.preset === 'quarter') {
    p.set('y', String(state.year))
  }
  if (state.preset === 'quarter') {
    p.set('q', String(state.quarter))
  }
  if (state.preset === 'custom') {
    p.set('from', state.customFrom)
    p.set('to', state.customTo)
  }
  const q = slice.query.trim()
  if (q) p.set('query', q)
  if (slice.clientId) p.set('client', slice.clientId)
  if (slice.invoiceStatus && slice.invoiceStatus !== 'all') p.set('invst', slice.invoiceStatus)
  if (slice.timesheetStatus && slice.timesheetStatus !== 'all') p.set('tsst', slice.timesheetStatus)
  return p.toString()
}

export function reportingStateToSearchParams(
  state: ReportingPeriodState,
  extra?: { query?: string; clientId?: string; status?: string },
): string {
  return listReportingToSearchParams({
    period: state,
    query: extra?.query ?? '',
    clientId: extra?.clientId ?? null,
    invoiceStatus: extra?.status ?? 'all',
    timesheetStatus: 'all',
  })
}
