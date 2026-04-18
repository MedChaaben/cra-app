import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

import type { Client, Invoice, InvoiceItem, Profile } from '@/types/models'

export type InvoicePdfInput = {
  profile: Profile
  client: Client
  invoice: Invoice
  items: InvoiceItem[]
}

/**
 * Helvetica standard (WinAnsi) ne peut pas encoder certains caractères Unicode
 * (ex. U+202F espace insécable étroit utilisé par fr-FR pour les montants).
 */
function sanitizePdfText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\u00a0/g, ' ')
    .replace(/\u202f/g, ' ')
    .replace(/\u2007/g, ' ')
    .replace(/\u2008/g, ' ')
    .replace(/\u2009/g, ' ')
    .replace(/\u200a/g, ' ')
    .replace(/\u00ad/g, '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, '...')
}

function formatMoney(amount: number, currency: string) {
  return sanitizePdfText(new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(amount))
}

export async function buildInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595.28, 841.89])
  const { width, height } = page.getSize()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

  const margin = 48
  let y = height - margin

  const drawText = (text: string, x: number, yy: number, size = 11, bold = false) => {
    page.drawText(sanitizePdfText(text), {
      x,
      y: yy,
      size,
      font: bold ? fontBold : font,
      color: rgb(0.12, 0.12, 0.14),
    })
  }

  drawText(input.profile.company_name ?? 'Votre société', margin, y, 18, true)
  y -= 26
  if (input.profile.company_address) {
    drawText(input.profile.company_address, margin, y, 10)
    y -= 14
  }
  if (input.profile.company_tax_id) {
    drawText(`N° TVA / SIRET : ${input.profile.company_tax_id}`, margin, y, 10)
    y -= 14
  }
  y -= 18

  drawText('Facture', width - margin - 120, height - margin, 22, true)
  drawText(input.invoice.invoice_number, width - margin - 120, height - margin - 26, 12)

  drawText(`Client : ${input.client.name}`, margin, y, 12, true)
  y -= 18
  if (input.client.address) {
    for (const line of input.client.address.split('\n')) {
      drawText(line, margin, y, 10)
      y -= 13
    }
  }
  y -= 10

  drawText(`Date d’émission : ${input.invoice.issue_date}`, margin, y, 10)
  y -= 14
  if (input.invoice.due_date) {
    drawText(`Date d’échéance : ${input.invoice.due_date}`, margin, y, 10)
    y -= 14
  }
  y -= 10

  const tableTop = y
  drawText('Description', margin, y, 10, true)
  drawText('Qté', margin + 280, y, 10, true)
  drawText('PU HT', margin + 330, y, 10, true)
  drawText('Total HT', margin + 410, y, 10, true)
  y -= 16
  page.drawLine({
    start: { x: margin, y: y + 6 },
    end: { x: width - margin, y: y + 6 },
    thickness: 0.5,
    color: rgb(0.85, 0.86, 0.9),
  })

  for (const item of input.items) {
    drawText(item.description, margin, y, 10)
    drawText(String(item.quantity), margin + 280, y, 10)
    drawText(formatMoney(item.unit_price, input.invoice.currency), margin + 330, y, 10)
    drawText(formatMoney(item.total_ht, input.invoice.currency), margin + 410, y, 10)
    y -= 16
    if (y < 200) break
  }

  y = Math.min(y, tableTop - 120)
  drawText(`Total HT : ${formatMoney(input.invoice.subtotal_ht, input.invoice.currency)}`, margin + 330, y, 11, true)
  y -= 16
  drawText(
    `TVA (${input.invoice.vat_rate}%) : ${formatMoney(input.invoice.vat_amount, input.invoice.currency)}`,
    margin + 330,
    y,
    11
  )
  y -= 18
  drawText(`Total TTC : ${formatMoney(input.invoice.total_ttc, input.invoice.currency)}`, margin + 330, y, 12, true)
  y -= 40

  if (input.profile.iban) {
    drawText(`IBAN : ${input.profile.iban}`, margin, y, 10)
    y -= 14
  }
  if (input.invoice.notes) {
    drawText('Notes', margin, y, 10, true)
    y -= 14
    for (const line of input.invoice.notes.split('\n')) {
      drawText(line, margin, y, 9)
      y -= 12
    }
  }

  drawText('Merci pour votre confiance.', margin, 72, 9, true)
  drawText('Document généré par CRA Studio', margin, 56, 8, false)

  return doc.save()
}
