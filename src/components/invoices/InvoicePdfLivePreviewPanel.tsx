import { ExternalLink, FileText, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { fetchCompanyLogoBytes } from '@/lib/fetchCompanyLogo'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase/client'
import { openPdfBlobInBrowser } from '@/services/invoices/invoicePdfStorage'
import { buildInvoicePdf } from '@/services/pdf/invoicePdf'
import type { InvoicePdfInput } from '@/services/pdf/invoice/types'

import { livePreviewInputKey } from './invoicePdfLivePreviewModel'

type Props = {
  /** Entrée PDF synchronisée (ex. après debounce des valeurs du formulaire). */
  input: InvoicePdfInput | null
  /** Nom de fichier pour « ouvrir dans un nouvel onglet ». */
  downloadBaseName: string
  className?: string
}

export function InvoicePdfLivePreviewPanel({ input, downloadBaseName, className }: Props) {
  const { t } = useTranslation()
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const blobUrlRef = useRef<string | null>(null)
  const previewBlobRef = useRef<Blob | null>(null)

  const stableKey = livePreviewInputKey(input)

  useEffect(() => {
    blobUrlRef.current = blobUrl
  }, [blobUrl])

  useEffect(() => {
    return () => {
      const u = blobUrlRef.current
      if (u) {
        URL.revokeObjectURL(u)
        blobUrlRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!input) {
      previewBlobRef.current = null
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    const run = async () => {
      try {
        const logoBytes = await fetchCompanyLogoBytes(supabase, input.profile.id, input.profile.logo_path)
        const pdfBytes = await buildInvoicePdf({ ...input, logoBytes })
        if (cancelled) return
        const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' })
        previewBlobRef.current = blob
        const url = URL.createObjectURL(blob)
        setBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          blobUrlRef.current = url
          return url
        })
        setError(null)
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg)
        previewBlobRef.current = null
        setBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          blobUrlRef.current = null
          return null
        })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [stableKey, input])

  const openExternal = () => {
    const b = previewBlobRef.current
    if (!b) return
    openPdfBlobInBrowser(b, downloadBaseName)
  }

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.07]',
        className,
      )}
    >
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border/70 bg-muted/25 px-4 py-3">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="text-sm font-semibold leading-none tracking-tight">{t('invoices.invoiceForm.livePdfTitle')}</p>
            {loading ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden /> : null}
          </div>
          <p className="text-xs text-muted-foreground">{t('invoices.invoiceForm.livePdfHint')}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 gap-1.5 px-2 text-xs"
          disabled={!blobUrl || loading}
          onClick={openExternal}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {t('invoices.invoiceForm.livePdfOpenTab')}
        </Button>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col bg-gradient-to-b from-muted/35 via-muted/20 to-muted/30">
        {!input ? (
          <div className="flex min-h-[14rem] flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center lg:min-h-0">
            <p className="max-w-[240px] text-sm text-muted-foreground">{t('invoices.invoiceForm.livePdfEmpty')}</p>
          </div>
        ) : error ? (
          <div className="flex min-h-[14rem] flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center lg:min-h-0">
            <p className="text-sm text-destructive">{t('invoices.invoiceForm.livePdfError')}</p>
            <p className="max-w-sm text-xs text-muted-foreground">{error}</p>
          </div>
        ) : (
          <div className="absolute inset-0 min-h-0 overflow-hidden">
            {loading && !blobUrl ? (
              <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-[1px]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-xs text-muted-foreground">{t('invoices.invoiceForm.livePdfLoading')}</p>
              </div>
            ) : null}
            {blobUrl ? (
              <iframe
                title={t('invoices.invoiceForm.livePdfTitle')}
                src={`${blobUrl}#toolbar=0&navpanes=0`}
                className="absolute inset-0 box-border size-full border-0 bg-white dark:bg-zinc-950"
              />
            ) : (
              !loading && (
                <div className="absolute inset-0 flex min-h-[14rem] items-center justify-center px-6 lg:min-h-0">
                  <p className="text-sm text-muted-foreground">{t('invoices.invoiceForm.livePdfLoading')}</p>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}
