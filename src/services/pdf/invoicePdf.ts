import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

import type { BillingUnit, Client, Invoice, InvoiceItem, Profile } from '@/types/models'

export type InvoicePdfInput = {
  profile: Profile
  client: Client
  invoice: Invoice
  items: InvoiceItem[]
}

const black = rgb(0, 0, 0)
const grayTitle = rgb(0.58, 0.58, 0.58)
const grayFillHeader = rgb(0.92, 0.92, 0.92)
const grayZebra = rgb(0.97, 0.97, 0.97)
const grayMontantCol = rgb(0.94, 0.94, 0.94)
const grayFooter = rgb(0.35, 0.35, 0.35)

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

function formatFrenchDate(isoDate: string): string {
  try {
    return sanitizePdfText(format(parseISO(isoDate), 'd MMMM yyyy', { locale: fr }))
  } catch {
    return sanitizePdfText(isoDate)
  }
}

function formatMoney(amount: number, currency: string): string {
  return sanitizePdfText(
    new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount),
  )
}

function formatQty(amount: number): string {
  return sanitizePdfText(
    new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount),
  )
}

function pdfBillingUnitLabel(unit: BillingUnit | string | undefined): string {
  const u = (unit ?? 'day') as BillingUnit
  switch (u) {
    case 'day':
      return 'jour(s)'
    case 'month':
      return 'mois'
    case 'hour':
      return 'h'
    case 'flat':
      return 'forfait'
    default:
      return ''
  }
}

/** Découpe simple sur 2 lignes max pour la colonne description. */
function wrapDescription(text: string, maxChars: number, maxLines: number): string[] {
  const words = sanitizePdfText(text).split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const w of words) {
    if (lines.length >= maxLines) break
    const trial = current ? `${current} ${w}` : w
    if (trial.length <= maxChars) {
      current = trial
      continue
    }
    if (current) {
      lines.push(current)
      current = ''
      if (lines.length >= maxLines) break
    }
    current = w.length > maxChars ? `${w.slice(0, maxChars - 1)}…` : w
  }
  if (lines.length < maxLines && current) lines.push(current)
  if (lines.length === 0) return ['']
  return lines.slice(0, maxLines)
}

export async function buildInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595.28, 841.89])
  const { width, height } = page.getSize()

  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique)

  const M = 36
  const xDesc = M
  const xQty = 232
  const xUnit = 278
  const xPU = 338
  const xMont = 412
  const xRight = width - M

  const wDesc = xQty - xDesc
  const wQty = xUnit - xQty
  const wUnit = xPU - xUnit
  const wPU = xMont - xPU
  const wMont = xRight - xMont

  const drawText = (
    text: string,
    x: number,
    y: number,
    size: number,
    opts?: { bold?: boolean; italic?: boolean; color?: ReturnType<typeof rgb> },
  ) => {
    const f = opts?.bold ? fontBold : opts?.italic ? fontItalic : font
    page.drawText(sanitizePdfText(text), {
      x,
      y,
      size,
      font: f,
      color: opts?.color ?? black,
    })
  }

  const drawRight = (text: string, rightX: number, y: number, size: number, opts?: { bold?: boolean }) => {
    const f = opts?.bold ? fontBold : font
    const t = sanitizePdfText(text)
    const w = f.widthOfTextAtSize(t, size)
    page.drawText(t, { x: rightX - w, y, size, font: f, color: black })
  }

  let y = height - M

  /* ----- En-tête société (gauche) ----- */
  drawText(input.profile.company_name ?? 'Votre société', xDesc, y, 14, { bold: true })
  y -= 20
  if (input.profile.company_tax_id) {
    drawText(input.profile.company_tax_id, xDesc, y, 9)
    y -= 12
  }
  if (input.profile.company_address) {
    for (const line of input.profile.company_address.split('\n')) {
      drawText(line.trim(), xDesc, y, 9)
      y -= 11
    }
  }
  y -= 6

  /* ----- En-tête facture (droite) ----- */
  const title = 'FACTURE'
  const titleSize = 26
  const titleW = fontBold.widthOfTextAtSize(title, titleSize)
  page.drawText(title, {
    x: xRight - titleW,
    y: height - M - 4,
    size: titleSize,
    font: fontBold,
    color: grayTitle,
  })

  const metaY = height - M - 36
  drawText('DATE', xRight - 150, metaY, 8, { bold: true })
  drawRight(formatFrenchDate(input.invoice.issue_date), xRight, metaY, 9)

  drawText('N° FACTURE', xRight - 150, metaY - 14, 8, { bold: true })
  drawRight(input.invoice.invoice_number, xRight, metaY - 14, 9)

  if (Number(input.invoice.vat_rate) === 0) {
    page.drawText(sanitizePdfText('TVA due par le preneur - Autoliquidation TVA Article 283-2 du CGI'), {
      x: xRight - 220,
      y: metaY - 28,
      size: 7,
      font: fontItalic,
      color: grayFooter,
    })
  }

  y = Math.min(y, metaY - 44)

  /* ----- FACTURER À ----- */
  drawText('FACTURER \u00c0 :', xDesc, y, 10, { bold: true })
  y -= 16
  drawText(input.client.name, xDesc, y, 10, { bold: true })
  y -= 13
  if (input.client.vat_number) {
    drawText(input.client.vat_number, xDesc, y, 9)
    y -= 11
  }
  if (input.client.email) {
    drawText(input.client.email, xDesc, y, 9)
    y -= 11
  }
  if (input.client.address) {
    for (const line of input.client.address.split('\n')) {
      drawText(line.trim(), xDesc, y, 9)
      y -= 11
    }
  }
  y -= 18

  /* ----- Tableau ----- */
  const rowH = 22
  const minBodyRows = 6
  const bodyRows = Math.max(input.items.length, minBodyRows)

  const drawCellBg = (x: number, yBottom: number, w: number, fill: ReturnType<typeof rgb>) => {
    page.drawRectangle({
      x,
      y: yBottom,
      width: w,
      height: rowH,
      color: fill,
      borderColor: black,
      borderWidth: 0.6,
    })
  }

  // Ligne d'en-tête tableau
  const headerBottom = y - rowH
  drawCellBg(xDesc, headerBottom, wDesc, grayFillHeader)
  drawCellBg(xQty, headerBottom, wQty, grayFillHeader)
  drawCellBg(xUnit, headerBottom, wUnit, grayFillHeader)
  drawCellBg(xPU, headerBottom, wPU, grayFillHeader)
  drawCellBg(xMont, headerBottom, wMont, grayMontantCol)

  const textPadY = headerBottom + 7
  drawText('DESCRIPTION', xDesc + 3, textPadY, 7, { bold: true })
  drawText('QTE', xQty + 3, textPadY, 7, { bold: true })
  drawText('UNITE', xUnit + 3, textPadY, 7, { bold: true })
  drawText('PU HT', xPU + 3, textPadY, 7, { bold: true })
  drawText('MONTANT', xMont + 3, textPadY, 7, { bold: true })

  y = headerBottom

  for (let i = 0; i < bodyRows; i += 1) {
    const rowBottom = y - rowH
    const item = input.items[i]
    const zebra = i % 2 === 1 ? grayZebra : rgb(1, 1, 1)

    drawCellBg(xDesc, rowBottom, wDesc, zebra)
    drawCellBg(xQty, rowBottom, wQty, zebra)
    drawCellBg(xUnit, rowBottom, wUnit, zebra)
    drawCellBg(xPU, rowBottom, wPU, zebra)
    drawCellBg(xMont, rowBottom, wMont, grayMontantCol)

    if (item) {
      const unit = item.billing_unit ?? 'day'
      const descLines = wrapDescription(item.description, 36, 2)
      if (descLines.length > 1 && descLines[1]) {
        drawText(descLines[0], xDesc + 3, rowBottom + 12, 7)
        drawText(descLines[1], xDesc + 3, rowBottom + 4, 7)
      } else {
        drawText(descLines[0] ?? '', xDesc + 3, rowBottom + 7, 7)
      }
      drawText(
        unit === 'flat' ? '-' : formatQty(Number(item.quantity)),
        xQty + 3,
        rowBottom + 7,
        7,
      )
      drawText(pdfBillingUnitLabel(unit), xUnit + 3, rowBottom + 7, 7)
      drawText(formatMoney(Number(item.unit_price), input.invoice.currency), xPU + 3, rowBottom + 7, 7)
      drawRight(formatMoney(Number(item.total_ht), input.invoice.currency), xRight - 3, rowBottom + 7, 7)
    }
    y = rowBottom
  }

  y -= 20

  /* ----- Totaux (alignés colonne montant) ----- */
  const labelX = xPU - 8
  const vatLabel =
    Number(input.invoice.vat_rate) === 0
      ? '0% Autoliquidation TVA'
      : `${sanitizePdfText(String(input.invoice.vat_rate))}%`
  let vatSize = 9
  while (font.widthOfTextAtSize(vatLabel, vatSize) > wMont + wPU - 8 && vatSize > 6) {
    vatSize -= 0.5
  }

  drawText('SOUS-TOTAL', labelX, y, 9)
  drawRight(formatMoney(input.invoice.subtotal_ht, input.invoice.currency), xRight, y, 9)
  y -= 14

  drawText('TAUX TVA', labelX, y, 9)
  drawRight(vatLabel, xRight, y, vatSize)
  y -= 14

  drawText('TOTAL', labelX, y, 10, { bold: true })
  drawRight(formatMoney(input.invoice.total_ttc, input.invoice.currency), xRight, y, 10, { bold: true })
  y -= 28

  /* ----- Pied ----- */
  if (input.profile.iban) {
    drawText(`IBAN : ${input.profile.iban}`, xDesc, y, 8, { color: grayFooter })
    y -= 12
  }
  const payL1 =
    'Paiement \u00e0 r\u00e9gler dans les 30 jours suivant la r\u00e9ception de facture. En cas de retard, une p\u00e9nalit\u00e9 de 1 % par mois'
  const payL2 = 'sera appliqu\u00e9e.'
  drawText(payL1, xDesc, y, 7, { color: grayFooter })
  y -= 10
  drawText(payL2, xDesc, y, 7, { color: grayFooter })
  y -= 18

  if (input.invoice.notes) {
    for (const line of input.invoice.notes.split('\n')) {
      drawText(line.trim(), xDesc, y, 7, { italic: true, color: grayFooter })
      y -= 10
    }
    y -= 6
  }

  const thanks = 'NOUS VOUS REMERCIONS DE VOTRE CONFIANCE.'
  const tw = fontBold.widthOfTextAtSize(thanks, 9)
  page.drawText(thanks, {
    x: (width - tw) / 2,
    y: M + 28,
    size: 9,
    font: fontBold,
    color: black,
  })

  drawText('Document g\u00e9n\u00e9r\u00e9 par CRA Studio', xDesc, M + 10, 7, { color: grayFooter })

  return doc.save()
}
