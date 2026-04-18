import type { Settings } from '@/types/models'

const DEFAULT_PAD = 4

export function formatInvoiceNumberFromSettings(
  settings: Pick<Settings, 'invoice_prefix' | 'next_invoice_sequence'>,
  pad = DEFAULT_PAD,
): string {
  const rawPrefix = String(settings.invoice_prefix ?? 'FAC').trim()
  const prefix = rawPrefix || 'FAC'
  const seq = Math.max(1, Math.floor(Number(settings.next_invoice_sequence) || 1))
  const w = Math.max(1, Math.min(12, Math.floor(pad) || DEFAULT_PAD))
  return `${prefix}-${String(seq).padStart(w, '0')}`
}
