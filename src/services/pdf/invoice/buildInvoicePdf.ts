import { PDFDocument, StandardFonts } from 'pdf-lib'
import type { PDFImage } from 'pdf-lib'

import { drawInvoicePage } from './invoicePdfDraw'
import { getInvoicePdfStrings } from './invoicePdfI18n'
import { resolveInvoiceTheme } from './invoicePdfThemes'
import { buildSepaEpcPayload, renderQrPngBytes } from './sepaEpcQr'
import type { InvoicePdfInput } from './types'
import { normalizeInvoicePdfLocale, normalizeInvoicePdfTemplate } from './types'

function shouldDrawSepaQr(input: InvoicePdfInput): boolean {
  if (input.settings.invoice_sepa_qr === false) return false
  if (String(input.invoice.currency).toUpperCase() !== 'EUR') return false
  const iban = input.profile.iban?.replace(/\s/g, '') ?? ''
  if (iban.length < 15) return false
  return /^[A-Z]{2}/.test(iban)
}

export async function buildInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const locale = normalizeInvoicePdfLocale(input.invoice.pdf_locale ?? input.settings.locale)
  const template = normalizeInvoicePdfTemplate(input.invoice.pdf_template ?? input.settings.invoice_template)
  const strings = getInvoicePdfStrings(locale)
  const theme = resolveInvoiceTheme(template, input.profile.brand_primary, input.profile.brand_secondary)

  const doc = await PDFDocument.create()
  const page = doc.addPage([595.28, 841.89])

  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique)

  let logoImage: PDFImage | null = null
  if (input.logoBytes?.length) {
    try {
      logoImage = await doc.embedPng(input.logoBytes)
    } catch {
      try {
        logoImage = await doc.embedJpg(input.logoBytes)
      } catch {
        logoImage = null
      }
    }
  }

  let qrImage: PDFImage | null = null
  if (shouldDrawSepaQr(input)) {
    const name =
      (input.profile.company_name ?? input.profile.full_name ?? 'Beneficiary').trim() || 'Beneficiary'
    const payload = buildSepaEpcPayload({
      iban: input.profile.iban!,
      bic: input.profile.bic,
      beneficiaryName: name,
      amount: input.invoice.total_ttc,
      remittance: input.invoice.invoice_number,
    })
    try {
      const png = await renderQrPngBytes(payload)
      qrImage = await doc.embedPng(png)
    } catch {
      qrImage = null
    }
  }

  drawInvoicePage({
    page,
    input,
    strings,
    theme,
    fonts: { font, fontBold, fontItalic },
    logoImage,
    qrImage,
    locale,
  })

  return doc.save()
}
