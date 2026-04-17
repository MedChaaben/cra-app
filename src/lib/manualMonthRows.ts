import { eachDayOfInterval, endOfMonth, format, getISODay, parseISO, startOfMonth } from 'date-fns'

import {
  buildFrenchMetropolitanHolidayMap,
  getFrenchMetropolitanHolidayLabel,
  listFrenchMetropolitanHolidaysInMonth,
} from '@/lib/frenchPublicHolidays'

export type ManualMonthRowDraft = {
  work_date: string
  project_name: string
  client_name: string
  hours: number
  daily_rate: number
  comment: string | null
  sort_order: number
}

export type DayRowKind = 'workday' | 'weekend' | 'holiday'

export function getDayRowKind(isoDate: string): DayRowKind {
  const holiday = getFrenchMetropolitanHolidayLabel(isoDate)
  if (holiday) return 'holiday'
  const d = parseISO(isoDate)
  if (Number.isNaN(+d)) return 'workday'
  const wd = getISODay(d)
  if (wd === 6 || wd === 7) return 'weekend'
  return 'workday'
}

/** Une ligne par jour du mois : 1 j. facturable par jour ouvré (lun–ven hors férié), sinon 0 j. */
export function buildManualMonthRows(
  year: number,
  month: number,
  defaults: { project: string; client: string; dailyRate: number },
): ManualMonthRowDraft[] {
  const start = startOfMonth(new Date(year, month - 1, 1))
  const end = endOfMonth(start)
  const holidayMap = buildFrenchMetropolitanHolidayMap(year)
  const days = eachDayOfInterval({ start, end })

  return days.map((d, idx) => {
    const work_date = format(d, 'yyyy-MM-dd')
    const wd = getISODay(d)
    const isWeekend = wd === 6 || wd === 7
    const holiday = holidayMap.get(work_date) ?? null
    const isBillableWorkday = !isWeekend && !holiday
    const hours = isBillableWorkday ? 1 : 0
    const comment = holiday ? `Férié — ${holiday}` : null

    return {
      work_date,
      project_name: defaults.project,
      client_name: defaults.client,
      hours,
      daily_rate: defaults.dailyRate,
      comment,
      sort_order: idx,
    }
  })
}

export function summarizeManualMonth(year: number, month: number) {
  const start = startOfMonth(new Date(year, month - 1, 1))
  const end = endOfMonth(start)
  const days = eachDayOfInterval({ start, end })
  const holidayMap = buildFrenchMetropolitanHolidayMap(year)
  let billableWorkdays = 0
  let weekendDays = 0
  let weekdayHolidays = 0

  for (const d of days) {
    const iso = format(d, 'yyyy-MM-dd')
    const wd = getISODay(d)
    const hol = holidayMap.get(iso)
    if (wd === 6 || wd === 7) {
      weekendDays += 1
      continue
    }
    if (hol) weekdayHolidays += 1
    else billableWorkdays += 1
  }

  return {
    calendarDays: days.length,
    billableWorkdays,
    weekendDays,
    weekdayHolidays,
    holidaysInMonth: listFrenchMetropolitanHolidaysInMonth(year, month),
  }
}
