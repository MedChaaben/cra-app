import type { BillingUnit, TimesheetEntry } from '@/types/models'

export const BILLING_UNITS: BillingUnit[] = ['day', 'month', 'hour', 'flat']

export type DraftInvoiceLine = {
  description: string
  quantity: number
  unitPrice: number
  billingUnit: BillingUnit
}

/** Total HT = somme (jours × TJM) sur toutes les lignes du CRA. */
export function aggregateTimesheetMoney(entries: TimesheetEntry[]): number {
  return entries.reduce((sum, e) => sum + (Number(e.hours) || 0) * (Number(e.daily_rate) || 0), 0)
}

/** Jours (ou équivalents-jours) facturables = somme des quantités du CRA. */
export function aggregateTimesheetDays(entries: TimesheetEntry[]): number {
  return entries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0)
}

/**
 * Une seule ligne synthétique : total jours × TJM moyen pondéré (= total HT / jours).
 */
export function suggestLineFromCra(
  entries: TimesheetEntry[],
  meta: { timesheetTitle: string; monthYear: string | null },
): DraftInvoiceLine {
  const days = aggregateTimesheetDays(entries)
  const totalHt = aggregateTimesheetMoney(entries)
  const unitPrice = days > 0 ? Math.round((totalHt / days) * 100) / 100 : 0
  const monthPart = meta.monthYear ? ` — ${meta.monthYear}` : ''
  const desc = `Prestations CRA${monthPart} (${meta.timesheetTitle})`
  return {
    description: desc,
    quantity: Math.round(days * 100) / 100,
    unitPrice,
    billingUnit: 'day',
  }
}
