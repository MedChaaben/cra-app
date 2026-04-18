import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Loader2, Pencil, Plus } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase/client'
import {
  downloadInvoicePdfFromStorage,
  normalizeInvoicePdfPath,
  openPdfBlobInBrowser,
  rebuildInvoicePdfPath,
} from '@/services/invoices/invoicePdfStorage'
import type { Invoice } from '@/types/models'

function invoiceStatusBadgeVariant(s: string): 'default' | 'secondary' | 'outline' {
  if (s === 'paid') return 'default'
  if (s === 'archived') return 'outline'
  return 'secondary'
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
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{inv.invoice_number}</p>
                    <Badge variant={invoiceStatusBadgeVariant(inv.status)} className="text-xs font-normal">
                      {t(`invoices.status.${inv.status}`)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {inv.issue_date} · {inv.currency}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <Button asChild variant="secondary" size="sm">
                    <Link to={`/invoices/${inv.id}`}>
                      <Pencil className="h-4 w-4" />
                      {t('invoices.edit')}
                    </Link>
                  </Button>
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
