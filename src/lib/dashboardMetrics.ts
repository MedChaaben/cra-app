import {
  endOfMonth,
  endOfYear,
  format,
  getDayOfYear,
  getDaysInYear,
  startOfMonth,
  startOfYear,
} from 'date-fns'

import { dateInRange, monthsSpannedInclusive, type ClosedDateRange } from '@/lib/reportingPeriod'

export type DashboardMetrics = {
  hoursMonth: number
  revenueMonthHt: number
  revenueYearHt: number
  soldDaysMonth: number
  soldDaysYear: number
  avgMonthlyRevenueYtdHt: number
  avgDailyRateYtd: number
  latePaymentCount: number
  latePaymentAmountTtc: number
  topClientName: string | null
  /** True si le plus gros volume HT est sur des lignes sans `client_id`. */
  topClientUnassigned: boolean
  topClientRevenueHt: number
  yearEndProjectionHt: number
  gapToInvoiceHt: number
  timesheetCount: number
  invoiceCount: number
}

export type RawEntryRow = {
  id: string
  hours: number | string | null
  daily_rate: number | string | null
  work_date: string | null
  client_id: string | null
  client_name: string | null
}

export type RawInvoiceRow = {
  id: string
  client_id: string
  issue_date?: string
  due_date: string | null
  status: string
  total_ttc: number | string | null
  subtotal_ht?: number | string | null
}

function num(v: number | string | null | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function entryHt(e: RawEntryRow): number {
  return num(e.hours) * num(e.daily_rate)
}

/** Agrège CRA + factures pour le tableau de bord. */
export function buildDashboardMetrics(
  now: Date,
  entries: RawEntryRow[],
  invoices: RawInvoiceRow[],
  invoicedEntryIds: Set<string>,
  clientNames: Map<string, string>,
  timesheetCount: number,
  invoiceCount: number,
): DashboardMetrics {
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd')
  const yearStart = format(startOfYear(now), 'yyyy-MM-dd')
  const yearEnd = format(endOfYear(now), 'yyyy-MM-dd')
  const today = format(now, 'yyyy-MM-dd')

  let hoursMonth = 0
  let revenueMonthHt = 0
  let soldDaysMonth = 0
  let revenueYearHt = 0
  let soldDaysYear = 0

  const byClient = new Map<string, number>()

  for (const e of entries) {
    const d = e.work_date
    const h = num(e.hours)
    const ht = entryHt(e)

    if (d && d >= monthStart && d <= monthEnd) {
      hoursMonth += h
      revenueMonthHt += ht
      soldDaysMonth += h
    }
    if (d && d >= yearStart && d <= yearEnd) {
      revenueYearHt += ht
      soldDaysYear += h
    }

    const cid = e.client_id ?? ''
    const key = cid || '__none__'
    byClient.set(key, (byClient.get(key) ?? 0) + ht)
  }

  let topKey: string | null = null
  let topClientRevenueHt = 0
  for (const [cid, rev] of byClient) {
    if (rev > topClientRevenueHt) {
      topClientRevenueHt = rev
      topKey = cid
    }
  }
  const topClientUnassigned = topKey === '__none__'
  let topClientName: string | null = null
  if (topKey && topClientRevenueHt > 0 && !topClientUnassigned) {
    topClientName =
      clientNames.get(topKey)?.trim() ||
      entries.find((e) => e.client_id === topKey)?.client_name?.trim() ||
      null
  }

  const monthsElapsed = now.getMonth() + 1
  const avgMonthlyRevenueYtdHt = monthsElapsed > 0 ? revenueYearHt / monthsElapsed : 0

  const avgDailyRateYtd = soldDaysYear > 0 ? revenueYearHt / soldDaysYear : 0

  const doy = getDayOfYear(now)
  const daysInYear = getDaysInYear(now)
  const yearEndProjectionHt =
    doy > 0 && revenueYearHt > 0 ? (revenueYearHt * daysInYear) / doy : revenueYearHt

  let gapToInvoiceHt = 0
  for (const e of entries) {
    if (invoicedEntryIds.has(e.id)) continue
    gapToInvoiceHt += entryHt(e)
  }

  let latePaymentCount = 0
  let latePaymentAmountTtc = 0
  for (const inv of invoices) {
    if (inv.status === 'paid' || inv.status === 'archived') continue
    const due = inv.due_date
    if (!due || due >= today) continue
    latePaymentCount += 1
    latePaymentAmountTtc += num(inv.total_ttc)
  }

  return {
    hoursMonth,
    revenueMonthHt,
    revenueYearHt,
    soldDaysMonth,
    soldDaysYear,
    avgMonthlyRevenueYtdHt,
    avgDailyRateYtd,
    latePaymentCount,
    latePaymentAmountTtc,
    topClientName,
    topClientUnassigned,
    topClientRevenueHt,
    yearEndProjectionHt,
    gapToInvoiceHt,
    timesheetCount,
    invoiceCount,
  }
}

export type ReportingDashboardMetrics = {
  craRevenueHt: number
  craHours: number
  soldDays: number
  avgDailyRate: number
  avgMonthlyRevenueHt: number
  invoicesCountInPeriod: number
  invoicesHtInPeriod: number
  invoicesTtcInPeriod: number
  latePaymentCount: number
  latePaymentAmountTtc: number
  topClientName: string | null
  topClientUnassigned: boolean
  topClientRevenueHt: number
  yearEndProjectionHt: number | null
  gapToInvoiceHt: number
  timesheetsInPeriod: number
  timesheetIdsInPeriod: string[]
}

function invoicePaid(status: string): boolean {
  return status === 'paid'
}

function invoiceIssueInPeriod(inv: RawInvoiceRow, range: ClosedDateRange | null): boolean {
  const issue = inv.issue_date
  if (!issue) return false
  return dateInRange(issue, range)
}

/** Agrégats tableau de bord pour une période fermée ou tout l’historique (`range === null`). */
export function buildReportingDashboardMetrics(
  now: Date,
  range: ClosedDateRange | null,
  entries: RawEntryRow[],
  invoices: RawInvoiceRow[],
  invoicedEntryIds: Set<string>,
  clientNames: Map<string, string>,
  timesheetIdsInPeriod: Set<string>,
): ReportingDashboardMetrics {
  const today = format(now, 'yyyy-MM-dd')
  const months = range ? monthsSpannedInclusive(range) : 1

  let craRevenueHt = 0
  let craHours = 0
  const byClient = new Map<string, number>()

  for (const e of entries) {
    const d = e.work_date
    if (!dateInRange(d, range)) continue
    const h = num(e.hours)
    const ht = entryHt(e)
    craHours += h
    craRevenueHt += ht
    const cid = e.client_id ?? ''
    const key = cid || '__none__'
    byClient.set(key, (byClient.get(key) ?? 0) + ht)
  }

  let topKey: string | null = null
  let topClientRevenueHt = 0
  for (const [cid, rev] of byClient) {
    if (rev > topClientRevenueHt) {
      topClientRevenueHt = rev
      topKey = cid
    }
  }
  const topClientUnassigned = topKey === '__none__'
  let topClientName: string | null = null
  if (topKey && topClientRevenueHt > 0 && !topClientUnassigned) {
    topClientName =
      clientNames.get(topKey)?.trim() ||
      entries.find((e) => e.client_id === topKey)?.client_name?.trim() ||
      null
  }

  const soldDays = craHours
  const avgDailyRate = soldDays > 0 ? craRevenueHt / soldDays : 0
  const avgMonthlyRevenueHt = months > 0 ? craRevenueHt / months : 0

  let invoicesCountInPeriod = 0
  let invoicesHtInPeriod = 0
  let invoicesTtcInPeriod = 0
  let latePaymentCount = 0
  let latePaymentAmountTtc = 0

  for (const inv of invoices) {
    if (!invoiceIssueInPeriod(inv, range)) continue
    invoicesCountInPeriod += 1
    invoicesHtInPeriod += num(inv.subtotal_ht ?? null)
    invoicesTtcInPeriod += num(inv.total_ttc)
    if (invoicePaid(inv.status)) continue
    const due = inv.due_date
    if (!due || due >= today) continue
    latePaymentCount += 1
    latePaymentAmountTtc += num(inv.total_ttc)
  }

  let gapToInvoiceHt = 0
  for (const e of entries) {
    if (!dateInRange(e.work_date, range)) continue
    if (invoicedEntryIds.has(e.id)) continue
    gapToInvoiceHt += entryHt(e)
  }

  let yearEndProjectionHt: number | null = null
  if (range) {
    const year = now.getFullYear()
    const yearStart = format(startOfYear(now), 'yyyy-MM-dd')
    const yearEnd = format(endOfYear(now), 'yyyy-MM-dd')
    const isCurrentYearSlice = range.start === yearStart && range.end === yearEnd && year === now.getFullYear()
    if (isCurrentYearSlice) {
      const doy = getDayOfYear(now)
      const daysInYear = getDaysInYear(now)
      yearEndProjectionHt = doy > 0 && craRevenueHt > 0 ? (craRevenueHt * daysInYear) / doy : craRevenueHt
    }
  }

  return {
    craRevenueHt,
    craHours,
    soldDays,
    avgDailyRate,
    avgMonthlyRevenueHt,
    invoicesCountInPeriod,
    invoicesHtInPeriod,
    invoicesTtcInPeriod,
    latePaymentCount,
    latePaymentAmountTtc,
    topClientName,
    topClientUnassigned,
    topClientRevenueHt,
    yearEndProjectionHt,
    gapToInvoiceHt,
    timesheetsInPeriod: timesheetIdsInPeriod.size,
    timesheetIdsInPeriod: [...timesheetIdsInPeriod],
  }
}
