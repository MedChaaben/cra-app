import type { InvoicePdfInput } from '@/services/pdf/invoice/types'
import type { BillingUnit, Client, Invoice, InvoiceItem, Profile, Settings } from '@/types/models'

const PREVIEW_INVOICE_PLACEHOLDER_ID = '00000000-0000-0000-0000-000000000000'

export type EditInvoiceLivePreviewForm = {
  clientId: string
  status: Invoice['status']
  issueDate: string
  vatRate: number
  notes?: string
  dueDate?: string
  currency: string
  pdfLocale: 'fr' | 'en'
  pdfTemplate: string
  lines: Array<{
    description?: string
    quantity?: number
    unitPrice?: number
    billingUnit?: BillingUnit
    timesheet_entry_id?: string | null
  }>
}

export type NewInvoiceLivePreviewForm = {
  clientId: string
  vatRate: number
  notes?: string
  dueDate?: string
  currency: string
  pdfLocale: 'fr' | 'en'
  pdfTemplate: string
  lines: Array<{
    description?: string
    quantity?: number
    unitPrice?: number
    billingUnit?: BillingUnit
  }>
}

function hasPreviewableLines(
  lines: Array<{ description?: string; quantity?: number; unitPrice?: number }>,
): boolean {
  const subtotal = lines.reduce((s, l) => {
    const q = Number(l.quantity) || 0
    const p = Number(l.unitPrice) || 0
    return s + q * p
  }, 0)
  if (subtotal < 0.01) return false
  return lines.some((l) => String(l.description ?? '').trim().length > 0)
}

export function buildLivePreviewInputEdit(
  values: EditInvoiceLivePreviewForm,
  row: Invoice,
  invoiceId: string,
  clients: Client[],
  profile: Profile,
  settings: Settings,
): InvoicePdfInput | null {
  if (!values.clientId?.trim()) return null
  const client = clients.find((c) => c.id === values.clientId)
  if (!client) return null
  if (!hasPreviewableLines(values.lines)) return null

  const draftItems: InvoiceItem[] = values.lines.map((l, i) => {
    const q = Number(l.quantity) || 0
    const up = Number(l.unitPrice) || 0
    const total_ht = Math.round(q * up * 100) / 100
    return {
      id: `live-${i}`,
      invoice_id: invoiceId,
      created_at: new Date().toISOString(),
      description: String(l.description ?? '').trim() || '—',
      quantity: q,
      unit_price: up,
      total_ht,
      billing_unit: (['day', 'month', 'hour', 'flat'] as const).includes(l.billingUnit as BillingUnit)
        ? (l.billingUnit as BillingUnit)
        : 'day',
      timesheet_entry_id: l.timesheet_entry_id ?? null,
    }
  })
  const subtotal_ht = draftItems.reduce((a, i) => a + i.total_ht, 0)
  const vat_amount = (subtotal_ht * (Number(values.vatRate) || 0)) / 100
  const total_ttc = subtotal_ht + vat_amount

  const previewInvoice: Invoice = {
    ...row,
    client_id: values.clientId,
    issue_date: values.issueDate,
    due_date: values.dueDate?.trim() ? values.dueDate : null,
    currency: values.currency,
    pdf_locale: values.pdfLocale,
    pdf_template: values.pdfTemplate,
    vat_rate: values.vatRate,
    notes: values.notes?.trim() ? values.notes : null,
    status: values.status,
    subtotal_ht,
    vat_amount,
    total_ttc,
  }

  return {
    profile,
    client,
    invoice: previewInvoice,
    items: draftItems,
    settings,
  }
}

export function buildLivePreviewInputNew(
  values: NewInvoiceLivePreviewForm,
  clients: Client[],
  profile: Profile,
  settings: Settings,
  userId: string,
  nextInvoiceNumber: string,
): InvoicePdfInput | null {
  if (!values.clientId?.trim()) return null
  const client = clients.find((c) => c.id === values.clientId)
  if (!client) return null
  if (!hasPreviewableLines(values.lines)) return null

  const draftItems: InvoiceItem[] = values.lines.map((l, i) => {
    const q = Number(l.quantity) || 0
    const up = Number(l.unitPrice) || 0
    const total_ht = Math.round(q * up * 100) / 100
    return {
      id: `live-${i}`,
      invoice_id: PREVIEW_INVOICE_PLACEHOLDER_ID,
      created_at: new Date().toISOString(),
      description: String(l.description ?? '').trim() || '—',
      quantity: q,
      unit_price: up,
      total_ht,
      billing_unit: (['day', 'month', 'hour', 'flat'] as const).includes(l.billingUnit as BillingUnit)
        ? (l.billingUnit as BillingUnit)
        : 'day',
      timesheet_entry_id: null,
    }
  })
  const subtotal_ht = draftItems.reduce((a, i) => a + i.total_ht, 0)
  const vat_amount = (subtotal_ht * (Number(values.vatRate) || 0)) / 100
  const total_ttc = subtotal_ht + vat_amount
  const now = new Date().toISOString()

  const previewInvoice: Invoice = {
    id: PREVIEW_INVOICE_PLACEHOLDER_ID,
    user_id: userId,
    client_id: client.id,
    created_at: now,
    updated_at: now,
    invoice_number: nextInvoiceNumber,
    issue_date: now.slice(0, 10),
    due_date: values.dueDate?.trim() ? values.dueDate : null,
    currency: values.currency,
    vat_rate: values.vatRate,
    notes: values.notes?.trim() ? values.notes : null,
    status: 'pending',
    pdf_path: null,
    subtotal_ht,
    vat_amount,
    total_ttc,
    pdf_locale: values.pdfLocale,
    pdf_template: values.pdfTemplate,
  }

  return {
    profile,
    client,
    invoice: previewInvoice,
    items: draftItems,
    settings,
  }
}

/** Clé stable pour éviter de régénérer le PDF si le contenu métier n’a pas changé. */
export function livePreviewInputKey(input: InvoicePdfInput | null): string {
  if (!input) return ''
  const { profile, client, invoice, items, settings } = input
  return JSON.stringify({
    cid: client.id,
    logo: profile.logo_path,
    bp: profile.brand_primary,
    bs: profile.brand_secondary,
    iban: profile.iban,
    inv: {
      num: invoice.invoice_number,
      issue: invoice.issue_date,
      due: invoice.due_date,
      cur: invoice.currency,
      vat: invoice.vat_rate,
      notes: invoice.notes,
      loc: invoice.pdf_locale,
      tpl: invoice.pdf_template,
      st: invoice.status,
      sub: invoice.subtotal_ht,
      tot: invoice.total_ttc,
    },
    items: items.map((i) => ({
      d: i.description,
      q: i.quantity,
      u: i.unit_price,
      t: i.total_ht,
      b: i.billing_unit,
    })),
    sepa: settings.invoice_sepa_qr,
    loc: settings.locale,
  })
}
