import { parseISO } from 'date-fns'

import { getDayRowKind, summarizeManualMonth } from '@/lib/manualMonthRows'

export type CraOuvreMonthStats = {
  /** Nombre de jours lun–ven hors férié (France métropolitaine) dans le mois. */
  ouvresInMonth: number
  /** Somme des quantités (j.) saisies sur ces jours ouvrés uniquement. */
  workedOnOuvres: number
  workedOnWeekend: number
  workedOnHolidays: number
}

export type CraEntryLite = {
  work_date: string | null
  hours: number | string | null | undefined
}

function monthPrefix(y: number, m: number) {
  return `${y}-${String(m).padStart(2, '0')}`
}

/** Mois CRA pour les stats : `month_year` YYYY-MM si valide, sinon premier `work_date` des entrées. */
export function resolveCraStatsMonth(monthYear: string | null | undefined, entries: CraEntryLite[]): { y: number; m: number } | null {
  const my = monthYear?.trim()
  if (my && /^\d{4}-\d{2}$/.test(my)) {
    const [y, mo] = my.split('-').map(Number)
    if (y && mo >= 1 && mo <= 12) return { y, m: mo }
  }
  const sorted = [...entries]
    .map((e) => e.work_date)
    .filter((d): d is string => Boolean(d))
    .sort()
  if (sorted.length) {
    const d = parseISO(sorted[0]!)
    if (!Number.isNaN(+d)) return { y: d.getFullYear(), m: d.getMonth() + 1 }
  }
  return null
}

function hoursNum(h: CraEntryLite['hours']): number {
  const n = Number(h)
  return Number.isFinite(n) ? n : 0
}

/** Agrège les jours saisis sur ouvrés vs week-end / fériés pour un mois civil donné. */
export function computeCraOuvreMonthStats(year: number, month: number, entries: CraEntryLite[]): CraOuvreMonthStats {
  const { billableWorkdays } = summarizeManualMonth(year, month)
  const pref = monthPrefix(year, month)
  let workedOnOuvres = 0
  let workedOnWeekend = 0
  let workedOnHolidays = 0

  for (const e of entries) {
    const wd = e.work_date
    if (!wd || !wd.startsWith(pref)) continue
    const h = hoursNum(e.hours)
    if (h === 0) continue
    const kind = getDayRowKind(wd)
    if (kind === 'workday') workedOnOuvres += h
    else if (kind === 'weekend') workedOnWeekend += h
    else workedOnHolidays += h
  }

  return {
    ouvresInMonth: billableWorkdays,
    workedOnOuvres,
    workedOnWeekend,
    workedOnHolidays,
  }
}

export function craOuvreFillRatio(stats: CraOuvreMonthStats): number {
  if (stats.ouvresInMonth <= 0) return 0
  return Math.min(1, stats.workedOnOuvres / stats.ouvresInMonth)
}
