import { endOfMonth, endOfYear, format, getDayOfYear, getDaysInYear, startOfMonth, startOfYear } from 'date-fns'

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
  due_date: string | null
  status: string
  total_ttc: number | string | null
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
