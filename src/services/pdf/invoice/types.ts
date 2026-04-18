import type { Client, Invoice, InvoiceItem, Profile, Settings } from '@/types/models'

export type InvoicePdfLocale = 'fr' | 'en'

export type InvoicePdfTemplateId = 'minimal' | 'corporate' | 'luxe' | 'consultant_it'

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
  if (t === 'minimal' || t === 'luxe' || t === 'consultant_it') return t
  return 'corporate'
}
