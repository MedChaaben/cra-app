import type { ParseTableProfile } from '@/services/ocr/parseTableText'

export const DOCUMENT_SOURCE_IDS: ParseTableProfile[] = [
  'auto',
  'excel_screenshot',
  'pdf_screenshot',
  'paper_photo',
  'outlook_table',
  'esn_accenture',
  'esn_capgemini',
  'esn_generic',
]

/** Infère un profil à partir du nom de fichier (heuristique légère). */
export function inferDocumentProfileFromFileName(fileName: string): ParseTableProfile {
  const n = fileName.toLowerCase()
  if (n.includes('accenture')) return 'esn_accenture'
  if (n.includes('capgemini')) return 'esn_capgemini'
  if (n.includes('outlook') || n.includes('message') || n.includes('mail')) return 'outlook_table'
  if (n.endsWith('.pdf') || n.includes('pdf')) return 'pdf_screenshot'
  if (n.includes('excel') || n.includes('xls') || n.includes('sheet')) return 'excel_screenshot'
  if (n.includes('img_') || n.includes('photo') || n.includes('dsc')) return 'paper_photo'
  return 'auto'
}
