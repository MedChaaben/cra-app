import type { Client, Invoice, InvoiceItem, Profile, Settings } from '@/types/models'

export type InvoicePdfLocale = 'fr' | 'en'

export const INVOICE_PDF_TEMPLATE_IDS = ['minimal', 'corporate', 'luxe', 'consultant_it'] as const
export type InvoicePdfTemplateId = (typeof INVOICE_PDF_TEMPLATE_IDS)[number]

export type InvoicePdfInput = {
  profile: Profile
  client: Client
  invoice: Invoice
  items: InvoiceItem[]
  settings: Settings
  logoBytes?: Uint8Array | null
}

export function normalizeInvoicePdfLocale(v: string | null | undefined): InvoicePdfLocale {
  return v === 'en' ? 'en' : 'fr'
}

export function normalizeInvoicePdfTemplate(v: string | null | undefined): InvoicePdfTemplateId {
  const t = (v ?? 'corporate').toLowerCase()
  return (INVOICE_PDF_TEMPLATE_IDS as readonly string[]).includes(t) ? (t as InvoicePdfTemplateId) : 'corporate'
}
