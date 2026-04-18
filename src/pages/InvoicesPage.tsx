import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Loader2, Plus } from 'lucide-react'
import { useCallback, useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'
import { fetchCompanyLogoBytes } from '@/lib/fetchCompanyLogo'
import { supabase } from '@/lib/supabase/client'
import { buildInvoicePdf } from '@/services/pdf/invoicePdf'
import type { Client, Invoice, InvoiceItem, Profile, Settings } from '@/types/models'

/** Chemin relatif au bucket (sans slash initial ni préfixe de bucket). */
function normalizeInvoicePdfPath(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const s = String(raw).trim().replace(/^\/+/, '')
  if (!s) return null
  return s.replace(/^invoices-pdf\//i, '')
}

function openPdfBlobInBrowser(blob: Blob, downloadBaseName: string) {
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

async function rebuildInvoicePdfPath(inv: Invoice, userId: string, t: TFunction): Promise<string | null> {
  const [{ data: profile, error: pErr }, { data: settings, error: sErr }, { data: client, error: cErr }, { data: items, error: iErr }] =
    await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('settings').select('*').eq('user_id', userId).single(),
      supabase.from('clients').select('*').eq('id', inv.client_id).single(),
      supabase.from('invoice_items').select('*').eq('invoice_id', inv.id).order('created_at'),
    ])
  if (pErr || sErr || cErr || iErr || !profile || !settings || !client || !items?.length) {
    toast.error(t('invoices.pdfRebuildError'))
    return null
  }
  const logoBytes = await fetchCompanyLogoBytes(supabase, userId, (profile as Profile).logo_path)
  const pdfBytes = await buildInvoicePdf({
    profile: profile as Profile,
    client: client as Client,
    invoice: inv,
    items: items as InvoiceItem[],
    settings: settings as Settings,
    logoBytes,
  })
  const path = `${userId}/${inv.id}.pdf`
  const { error: upErr } = await supabase.storage.from('invoices-pdf').upload(path, pdfBytes, {
    contentType: 'application/pdf',
    upsert: true,
  })
  if (upErr) {
    toast.error(t('invoices.pdfUploadError'))
    return null
  }
  const { error: metaErr } = await supabase.from('invoices').update({ pdf_path: path }).eq('id', inv.id)
  if (metaErr) {
    toast.error(t('invoices.pdfMetaError'))
    return null
  }
  return path
}

async function downloadInvoicePdfFromStorage(path: string): Promise<{ blob: Blob } | { error: Error }> {
  const { data, error } = await supabase.storage.from('invoices-pdf').download(path)
  if (error) {
    return { error: new Error(error.message) }
  }
  if (!data || data.size === 0) {
    return { error: new Error('empty file') }
  }
  return { blob: data }
}

export default function InvoicesPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [openingPdfId, setOpeningPdfId] = useState<string | null>(null)

  const openInvoicePdf = useCallback(
    async (inv: Invoice) => {
      if (!user?.id) return
      setOpeningPdfId(inv.id)
      try {
        let path = normalizeInvoicePdfPath(inv.pdf_path)
        if (!path) {
          path = await rebuildInvoicePdfPath(inv, user.id, t)
          if (!path) return
          await qc.invalidateQueries({ queryKey: ['invoices-all', user.id] })
        }

        const tryOpen = async (p: string) => {
          const res = await downloadInvoicePdfFromStorage(p)
          if ('error' in res) {
            return res.error
          }
          openPdfBlobInBrowser(res.blob, inv.invoice_number)
          return null
        }

        let err = await tryOpen(path)
        if (!err) return

        // Fichier absent ou chemin obsolète : régénère puis réessaie une fois.
        const rebuilt = await rebuildInvoicePdfPath(inv, user.id, t)
        if (rebuilt) {
          await qc.invalidateQueries({ queryKey: ['invoices-all', user.id] })
          err = await tryOpen(rebuilt)
          if (!err) return
        }

        const hint = err.message ? t('invoices.openPdfStorageHint', { detail: err.message }) : ''
        toast.error([t('invoices.openPdfError'), hint].filter(Boolean).join(' '))
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e)
        toast.error(
          [t('invoices.openPdfError'), detail ? t('invoices.openPdfStorageHint', { detail }) : '']
            .filter(Boolean)
            .join(' '),
        )
      } finally {
        setOpeningPdfId(null)
      }
    },
    [t, user?.id, qc],
  )

  const q = useQuery({
    queryKey: ['invoices-all', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<Invoice[]> => {
      const { data, error } = await supabase.from('invoices').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Invoice[]
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t('invoices.title')}</h1>
          <p className="text-muted-foreground">Historique et montants TTC.</p>
        </div>
        <Button asChild>
          <Link to="/invoices/new">
            <Plus className="h-4 w-4" />
            {t('invoices.new')}
          </Link>
        </Button>
      </div>

      <Card className="border-border/80">
        <CardHeader>
          <CardTitle>Liste</CardTitle>
          <CardDescription>Documents générés depuis CRA Studio.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {q.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : q.data?.length ? (
            q.data.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{inv.invoice_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {inv.issue_date} · {inv.status}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-amber-500/35"
                    disabled={openingPdfId === inv.id}
                    onClick={() => void openInvoicePdf(inv)}
                  >
                    {openingPdfId === inv.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                    {t('invoices.viewPdf')}
                  </Button>
                  <p className="text-lg font-semibold tabular-nums sm:min-w-[7rem] sm:text-right">
                    {new Intl.NumberFormat(undefined, { style: 'currency', currency: inv.currency }).format(inv.total_ttc)}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Aucune facture pour le moment.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
