import { format, parseISO } from 'date-fns'
import { enUS } from 'date-fns/locale'
import { fr } from 'date-fns/locale'
import type { PDFImage, PDFFont, PDFPage } from 'pdf-lib'
import { rgb } from 'pdf-lib'

import type { BillingUnit } from '@/types/models'

import type { InvoicePdfStrings } from './invoicePdfI18n'
import type { InvoicePdfTheme } from './invoicePdfThemes'
import type { InvoicePdfInput, InvoicePdfLocale } from './types'

const black = rgb(0, 0, 0)
const white = rgb(1, 1, 1)

/**
 * Helvetica standard (WinAnsi) ne peut pas encoder certains caractères Unicode
 * (ex. U+202F espace insécable étroit utilisé par fr-FR pour les montants).
 */
export function sanitizePdfText(text: string): string {
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

export function formatInvoiceDate(isoDate: string, locale: InvoicePdfLocale): string {
  try {
    const pat = locale === 'en' ? 'MMMM d, yyyy' : 'd MMMM yyyy'
    const loc = locale === 'en' ? enUS : fr
    return sanitizePdfText(format(parseISO(isoDate), pat, { locale: loc }))
  } catch {
    return sanitizePdfText(isoDate)
  }
}

export function formatInvoiceMoney(locale: InvoicePdfLocale, amount: number, currency: string): string {
  const loc = locale === 'en' ? 'en-US' : 'fr-FR'
  return sanitizePdfText(
    new Intl.NumberFormat(loc, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount),
  )
}

export function formatQty(locale: InvoicePdfLocale, amount: number): string {
  const loc = locale === 'en' ? 'en-US' : 'fr-FR'
  return sanitizePdfText(
    new Intl.NumberFormat(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount),
  )
}

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

export type InvoiceDrawFonts = { font: PDFFont; fontBold: PDFFont; fontItalic: PDFFont }

export function drawInvoicePage(args: {
  page: PDFPage
  input: InvoicePdfInput
  strings: InvoicePdfStrings
  theme: InvoicePdfTheme
  fonts: InvoiceDrawFonts
  logoImage: PDFImage | null
  qrImage: PDFImage | null
  locale: InvoicePdfLocale
}): void {
  const { page, input, strings, theme, fonts, logoImage, qrImage, locale } = args
  const { font, fontBold, fontItalic } = fonts
  const { width, height } = page.getSize()

  const M = 36
  const leftInset = theme.showLeftBar ? theme.leftBarWidth + 8 : 0
  const xDesc = M + leftInset
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

  if (theme.showLeftBar && theme.leftBarWidth > 0) {
    page.drawRectangle({
      x: 0,
      y: 0,
      width: theme.leftBarWidth,
      height,
      color: theme.accent,
    })
  }

  if (theme.showTopBand) {
    page.drawRectangle({
      x: 0,
      y: height - 5,
      width,
      height: 5,
      color: theme.accent,
    })
  }

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

  const drawRight = (text: string, rightX: number, y: number, size: number, opts?: { bold?: boolean; color?: ReturnType<typeof rgb> }) => {
    const f = opts?.bold ? fontBold : font
    const t = sanitizePdfText(text)
    const w = f.widthOfTextAtSize(t, size)
    page.drawText(t, { x: rightX - w, y, size, font: f, color: opts?.color ?? black })
  }

  const topBaseline = height - M - 4
  let companyX = xDesc
  if (logoImage) {
    const maxW = 112
    const maxH = 44
    const scale = Math.min(maxW / logoImage.width, maxH / logoImage.height)
    const lw = logoImage.width * scale
    const lh = logoImage.height * scale
    page.drawImage(logoImage, { x: xDesc, y: topBaseline - lh + 2, width: lw, height: lh })
    companyX = xDesc + lw + 14
  }

  drawText(input.profile.company_name ?? '—', companyX, topBaseline, 14, { bold: true })
  let y = topBaseline - 18
  if (input.profile.company_tax_id) {
    drawText(input.profile.company_tax_id, companyX, y, 9)
    y -= 12
  }
  if (input.profile.company_address) {
    for (const line of input.profile.company_address.split('\n')) {
      drawText(line.trim(), companyX, y, 9)
      y -= 11
    }
  }
  const contactBits = [input.profile.company_email, input.profile.company_phone].filter(Boolean) as string[]
  if (contactBits.length) {
    drawText(contactBits.join(' · '), companyX, y, 8, { color: theme.footer })
    y -= 11
  }
  y -= 4

  const title = strings.invoiceTitle
  const titleSize = theme.titleSize
  const titleW = fontBold.widthOfTextAtSize(title, titleSize)
  page.drawText(title, {
    x: xRight - titleW,
    y: height - M - 4,
    size: titleSize,
    font: fontBold,
    color: theme.headerTitleColor,
  })

  if (theme.tagline) {
    const tag = locale === 'en' ? theme.tagline.en : theme.tagline.fr
    drawText(tag, companyX, height - M - titleSize - 2, 7, { italic: true, color: theme.muted })
  }

  const metaY = height - M - 36
  drawText(strings.dateLabel, xRight - 150, metaY, 8, { bold: true })
  drawRight(formatInvoiceDate(input.invoice.issue_date, locale), xRight, metaY, 9)

  drawText(strings.invoiceNoLabel, xRight - 150, metaY - 14, 8, { bold: true })
  drawRight(input.invoice.invoice_number, xRight, metaY - 14, 9)

  let metaNext = metaY - 14
  if (input.invoice.due_date) {
    metaNext -= 14
    drawText(strings.dueDateLabel, xRight - 150, metaNext, 8, { bold: true })
    drawRight(formatInvoiceDate(input.invoice.due_date, locale), xRight, metaNext, 9)
  }

  const vatZero = Number(input.invoice.vat_rate) === 0
  const customVat = input.profile.vat_zero_note?.trim()
  if (vatZero) {
    metaNext -= 12
    const note = customVat ? customVat : strings.autoliquidationVat
    const noteLines = note.split('\n').slice(0, 3)
    for (const nl of noteLines) {
      page.drawText(sanitizePdfText(nl), {
        x: xRight - 220,
        y: metaNext,
        size: 6.5,
        font: fontItalic,
        color: theme.footer,
      })
      metaNext -= 9
    }
  }

  y = Math.min(y, metaNext - 10)

  drawText(`${strings.billTo} :`, xDesc, y, 10, { bold: true })
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
      borderColor: rgb(0.75, 0.75, 0.75),
      borderWidth: theme.tableBorder,
    })
  }

  const headerBottom = y - rowH
  drawCellBg(xDesc, headerBottom, wDesc, theme.tableHeaderBg)
  drawCellBg(xQty, headerBottom, wQty, theme.tableHeaderBg)
  drawCellBg(xUnit, headerBottom, wUnit, theme.tableHeaderBg)
  drawCellBg(xPU, headerBottom, wPU, theme.tableHeaderBg)
  drawCellBg(xMont, headerBottom, wMont, theme.tableHeaderBg)

  const headerFg = theme.tableHeaderFg ?? black
  const textPadY = headerBottom + 7
  drawText(strings.tableDesc, xDesc + 3, textPadY, 7, { bold: true, color: headerFg })
  drawText(strings.tableQty, xQty + 3, textPadY, 7, { bold: true, color: headerFg })
  drawText(strings.tableUnit, xUnit + 3, textPadY, 7, { bold: true, color: headerFg })
  drawText(strings.tableUnitPrice, xPU + 3, textPadY, 7, { bold: true, color: headerFg })
  drawText(strings.tableAmount, xMont + 3, textPadY, 7, { bold: true, color: headerFg })

  y = headerBottom

  for (let i = 0; i < bodyRows; i += 1) {
    const rowBottom = y - rowH
    const item = input.items[i]
    const zebra = i % 2 === 1 ? theme.zebra : white

    drawCellBg(xDesc, rowBottom, wDesc, zebra)
    drawCellBg(xQty, rowBottom, wQty, zebra)
    drawCellBg(xUnit, rowBottom, wUnit, zebra)
    drawCellBg(xPU, rowBottom, wPU, zebra)
    drawCellBg(xMont, rowBottom, wMont, theme.montantCol)

    if (item) {
      const unit = (item.billing_unit ?? 'day') as BillingUnit
      const descLines = wrapDescription(item.description, 36, 2)
      if (descLines.length > 1 && descLines[1]) {
        drawText(descLines[0], xDesc + 3, rowBottom + 12, 7)
        drawText(descLines[1], xDesc + 3, rowBottom + 4, 7)
      } else {
        drawText(descLines[0] ?? '', xDesc + 3, rowBottom + 7, 7)
      }
      drawText(
        unit === 'flat' ? '-' : formatQty(locale, Number(item.quantity)),
        xQty + 3,
        rowBottom + 7,
        7,
      )
      drawText(strings.billingUnit(unit), xUnit + 3, rowBottom + 7, 7)
      drawText(
        formatInvoiceMoney(locale, Number(item.unit_price), input.invoice.currency),
        xPU + 3,
        rowBottom + 7,
        7,
      )
      drawRight(
        formatInvoiceMoney(locale, Number(item.total_ht), input.invoice.currency),
        xRight - 3,
        rowBottom + 7,
        7,
      )
    }
    y = rowBottom
  }

  y -= 20

  const labelX = xPU - 8
  const vatLabel = vatZero ? '0%' : `${sanitizePdfText(String(input.invoice.vat_rate))}%`
  let vatSize = 9
  while (font.widthOfTextAtSize(vatLabel, vatSize) > wMont + wPU - 8 && vatSize > 6) {
    vatSize -= 0.5
  }

  drawText(strings.subtotal, labelX, y, 9)
  drawRight(formatInvoiceMoney(locale, input.invoice.subtotal_ht, input.invoice.currency), xRight, y, 9)
  y -= 14

  drawText(strings.vatRate, labelX, y, 9)
  drawRight(vatLabel, xRight, y, vatSize)
  y -= 14

  drawText(strings.total, labelX, y, 10, { bold: true })
  drawRight(formatInvoiceMoney(locale, input.invoice.total_ttc, input.invoice.currency), xRight, y, 10, { bold: true })
  y -= 22

  const qrReserve = qrImage ? 118 : 0
  const textMaxW = width - M * 2 - qrReserve

  const wrapFooter = (raw: string, size: number, lineH: number, startY: number): number => {
    let yy = startY
    const maxChars = Math.max(20, Math.floor(textMaxW / (size * 0.45)))
    for (const paragraph of raw.split('\n')) {
      const words = sanitizePdfText(paragraph).split(/\s+/).filter(Boolean)
      let line = ''
      for (const w of words) {
        const trial = line ? `${line} ${w}` : w
        if (trial.length <= maxChars) {
          line = trial
        } else {
          if (line) {
            drawText(line, xDesc, yy, size, { color: theme.footer })
            yy -= lineH
          }
          line = w.length > maxChars ? `${w.slice(0, maxChars - 1)}…` : w
        }
      }
      if (line) {
        drawText(line, xDesc, yy, size, { color: theme.footer })
        yy -= lineH
      }
    }
    return yy
  }

  const payTerms = (input.settings.invoice_payment_terms ?? '').trim() || strings.defaultPaymentTerms
  const latePen = (input.settings.invoice_late_penalty ?? '').trim() || strings.defaultLatePenalty

  drawText(`${strings.paymentTermsTitle} —`, xDesc, y, 8, { bold: true, color: theme.footer })
  y -= 11
  y = wrapFooter(payTerms, 7.5, 10, y) - 6

  drawText(`${strings.latePenaltyTitle} —`, xDesc, y, 8, { bold: true, color: theme.footer })
  y -= 11
  y = wrapFooter(latePen, 7.5, 10, y) - 6

  if (input.profile.iban) {
    drawText(`${strings.ibanLabel} : ${sanitizePdfText(input.profile.iban)}`, xDesc, y, 8, { color: theme.footer })
    y -= 12
  }
  if (input.profile.bic?.trim()) {
    drawText(`${strings.bicLabel} : ${sanitizePdfText(input.profile.bic.trim())}`, xDesc, y, 8, { color: theme.footer })
    y -= 12
  }
  y -= 6

  if (input.invoice.notes) {
    for (const line of input.invoice.notes.split('\n')) {
      drawText(line.trim(), xDesc, y, 7, { italic: true, color: theme.footer })
      y -= 10
    }
    y -= 6
  }

  if (qrImage) {
    const qw = 96
    const qh = 96
    const qx = xRight - qw
    const qy = M + 52
    page.drawImage(qrImage, { x: qx, y: qy, width: qw, height: qh })
    drawText(strings.sepaQrCaption, qx, qy - 10, 6.5, { color: theme.footer })
  }

  const thanks = strings.thanks
  const tw = fontBold.widthOfTextAtSize(thanks, 9)
  page.drawText(thanks, {
    x: (width - tw) / 2,
    y: M + 28,
    size: 9,
    font: fontBold,
    color: theme.accentSoft,
  })

  drawText(strings.generatedBy, xDesc, M + 10, 7, { color: theme.footer })
}
