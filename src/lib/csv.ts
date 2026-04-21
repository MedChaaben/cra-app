import type { TimesheetEntry } from '@/types/models'

export function downloadTimesheetCsv(filename: string, rows: TimesheetEntry[]) {
  const header = ['date', 'mission', 'client', 'jours', 'tjm', 'commentaire', 'confiance_ocr']
  const lines = rows.map((r) =>
    [
      r.work_date ?? '',
      escapeCsv(r.project_name ?? ''),
      escapeCsv(r.client_name ?? ''),
      String(r.hours ?? ''),
      String(r.daily_rate ?? ''),
      escapeCsv(r.comment ?? ''),
      r.ocr_confidence != null ? String(Math.round(r.ocr_confidence)) : '',
    ].join(';')
  )
  const content = [header.join(';'), ...lines].join('\n')
  const blob = new Blob(['\ufeff', content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function escapeCsv(value: string) {
  if (value.includes(';') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
