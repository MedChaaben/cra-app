import { addDays, format } from 'date-fns'

/** Algorithme de Meeus — dimanche de Pâques (calendrier grégorien). */
function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

/** Jours fériés nationaux — France métropolitaine (hors départements avec règles locales). */
export function buildFrenchMetropolitanHolidayMap(year: number): ReadonlyMap<string, string> {
  const m = new Map<string, string>()
  const add = (d: Date, label: string) => {
    m.set(format(d, 'yyyy-MM-dd'), label)
  }
  const e = easterSunday(year)

  add(new Date(year, 0, 1), "Jour de l'an")
  add(addDays(e, 1), 'Lundi de Pâques')
  add(new Date(year, 4, 1), 'Fête du Travail')
  add(new Date(year, 4, 8), 'Victoire 1945')
  add(addDays(e, 39), 'Ascension')
  add(addDays(e, 50), 'Lundi de Pentecôte')
  add(new Date(year, 6, 14), 'Fête nationale')
  add(new Date(year, 7, 15), 'Assomption')
  add(new Date(year, 9, 1), 'Toussaint')
  add(new Date(year, 10, 11), 'Armistice 1918')
  add(new Date(year, 11, 25), 'Noël')

  return m
}

export function getFrenchMetropolitanHolidayLabel(isoDate: string): string | null {
  const y = Number(isoDate.slice(0, 4))
  if (!Number.isFinite(y) || isoDate.length < 10) return null
  return buildFrenchMetropolitanHolidayMap(y).get(isoDate) ?? null
}

export function listFrenchMetropolitanHolidaysInMonth(
  year: number,
  month: number,
): { date: string; label: string }[] {
  const map = buildFrenchMetropolitanHolidayMap(year)
  const mm = String(month).padStart(2, '0')
  const prefix = `${year}-${mm}`
  return [...map.entries()]
    .filter(([d]) => d.startsWith(prefix))
    .map(([date, label]) => ({ date, label }))
    .sort((a, b) => a.date.localeCompare(b.date))
}
