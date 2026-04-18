import type { TFunction } from 'i18next'
import { toast } from 'sonner'

import { fetchCompanyLogoBytes } from '@/lib/fetchCompanyLogo'
import { supabase } from '@/lib/supabase/client'
import { buildInvoicePdf } from '@/services/pdf/invoicePdf'
import type { InvoicePdfInput } from '@/services/pdf/invoice/types'
import type { Client, Invoice, InvoiceItem, Profile, Settings } from '@/types/models'

/** Chemin relatif au bucket (sans slash initial ni préfixe de bucket). */
export function normalizeInvoicePdfPath(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const s = String(raw).trim().replace(/^\/+/, '')
  if (!s) return null
  return s.replace(/^invoices-pdf\//i, '')
}

export function openPdfBlobInBrowser(blob: Blob, downloadBaseName: string) {
  const safeName = downloadBaseName.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'facture'
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank', 'noopener,noreferrer')
  const popupLikelyBlocked = win == null || win.closed
  if (popupLikelyBlocked) {
    const a = document.createElement('a')
    a.href = url
    a.download = `${safeName}.pdf`
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 180_000)
}

export async function rebuildInvoicePdfPath(inv: Invoice, userId: string, t: TFunction): Promise<string | null> {
  const { data: freshInvoice } = await supabase.from('invoices').select('*').eq('id', inv.id).maybeSingle()
  const invoiceRow = (freshInvoice ?? inv) as Invoice

  const [{ data: profile, error: pErr }, { data: settings, error: sErr }, { data: client, error: cErr }, { data: items, error: iErr }] =
    await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('settings').select('*').eq('user_id', userId).single(),
      supabase.from('clients').select('*').eq('id', invoiceRow.client_id).single(),
      supabase.from('invoice_items').select('*').eq('invoice_id', invoiceRow.id).order('created_at'),
    ])
  if (pErr || sErr || cErr || iErr || !profile || !settings || !client || !items?.length) {
    toast.error(t('invoices.pdfRebuildError'))
    return null
  }
  const logoBytes = await fetchCompanyLogoBytes(supabase, userId, (profile as Profile).logo_path)
  const pdfBytes = await buildInvoicePdf({
    profile: profile as Profile,
    client: client as Client,
    invoice: invoiceRow,
    items: items as InvoiceItem[],
    settings: settings as Settings,
    logoBytes,
  })
  const path = `${userId}/${invoiceRow.id}.pdf`
  const { error: upErr } = await supabase.storage.from('invoices-pdf').upload(path, pdfBytes, {
    contentType: 'application/pdf',
    upsert: true,
  })
  if (upErr) {
    toast.error(t('invoices.pdfUploadError'))
    return null
  }
  const { error: metaErr } = await supabase.from('invoices').update({ pdf_path: path }).eq('id', invoiceRow.id)
  if (metaErr) {
    toast.error(t('invoices.pdfMetaError'))
    return null
  }
  return path
}

export async function downloadInvoicePdfFromStorage(path: string): Promise<{ blob: Blob } | { error: Error }> {
  const cacheNonce = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
  const { data, error } = await supabase.storage
    .from('invoices-pdf')
    .download(path, { cacheNonce }, { cache: 'no-store' })
  if (error) {
    return { error: new Error(error.message) }
  }
  if (!data || data.size === 0) {
    return { error: new Error('empty file') }
  }
  return { blob: data }
}

/** Ouvre un PDF généré en local (aperçu brouillon, sans lecture du fichier stocké). */
export async function openInvoicePdfPreviewInBrowser(input: InvoicePdfInput, downloadBaseName: string): Promise<void> {
  const pdfBytes = await buildInvoicePdf(input)
  const blob = new Blob([pdfBytes], { type: 'application/pdf' })
  openPdfBlobInBrowser(blob, downloadBaseName)
}
