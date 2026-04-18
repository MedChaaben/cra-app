import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { enUS, fr } from 'date-fns/locale'
import { FileText, Loader2, Pencil, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { ReportingFiltersCard } from '@/components/reporting/ReportingFiltersCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useClients } from '@/hooks/useClients'
import { useDebounced } from '@/hooks/useDebounced'
import { useListReportingUrl } from '@/hooks/useListReportingUrl'
import { dateInRange, resolveReportingRange, type ClosedDateRange } from '@/lib/reportingPeriod'
import { invoiceMatchesStatusFilter, normalizeInvoiceDbStatus } from '@/lib/invoiceFilters'
import { supabase } from '@/lib/supabase/client'
import {
  downloadInvoicePdfFromStorage,
  normalizeInvoicePdfPath,
  openPdfBlobInBrowser,
  rebuildInvoicePdfPath,
} from '@/services/invoices/invoicePdfStorage'
import type { Invoice } from '@/types/models'

function invoiceStatusBadgeVariant(s: string): 'default' | 'secondary' | 'outline' | 'warning' {
  const n = normalizeInvoiceDbStatus(s)
  if (n === 'paid') return 'default'
  if (n === 'archived') return 'outline'
  if (s === 'draft') return 'warning'
  return 'secondary'
}

function invoiceStatusLabelKey(raw: string): string {
  const n = normalizeInvoiceDbStatus(raw)
  if (raw === 'draft' || raw === 'sent') return `invoices.status.${raw}`
  return `invoices.status.${n}`
}

export default function InvoicesPage() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [openingPdfId, setOpeningPdfId] = useState<string | null>(null)
  const { slice, commit } = useListReportingUrl()
  const [searchDraft, setSearchDraft] = useState(slice.query)
  const clientsQuery = useClients(user?.id)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- source de vérité externe (search params)
    setSearchDraft(slice.query)
  }, [slice.query])

  const debouncedSearch = useDebounced(searchDraft, 400)
  useEffect(() => {
    if (debouncedSearch !== slice.query) {
      commit({ query: debouncedSearch })
    }
  }, [debouncedSearch, slice.query, commit])

  const range = useMemo(() => resolveReportingRange(slice.period, new Date()), [slice.period])

  const rangeLabel = useMemo(() => {
    if (!range) return t('reporting.rangeAll')
    const loc = i18n.language === 'en' ? enUS : fr
    const a = format(parseISO(range.start), 'd MMM yyyy', { locale: loc })
    const b = format(parseISO(range.end), 'd MMM yyyy', { locale: loc })
    return t('reporting.rangeLabel', { from: a, to: b })
  }, [range, t, i18n.language])

  const clientNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of clientsQuery.data ?? []) {
      m.set(c.id, c.name)
    }
    return m
  }, [clientsQuery.data])

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
    [t, user, qc],
  )

  const q = useQuery({
    queryKey: ['invoices-all', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<Invoice[]> => {
      const { data, error } = await supabase.from('invoices').select('*').order('issue_date', { ascending: false })
      if (error) throw error
      return (data ?? []) as Invoice[]
    },
  })

  const invoiceStatus = (slice.invoiceStatus as 'all' | 'pending' | 'paid' | 'archived') || 'all'

  const filtered = useMemo(() => {
    const rows = q.data ?? []
    const qn = slice.query.trim().toLowerCase()
    return rows.filter((inv) => {
      if (!dateInRange(inv.issue_date, range as ClosedDateRange | null)) return false
      if (slice.clientId && inv.client_id !== slice.clientId) return false
      if (!invoiceMatchesStatusFilter(inv.status, invoiceStatus)) return false
      if (!qn) return true
      const cname = (clientNameById.get(inv.client_id) ?? '').toLowerCase()
      return (
        inv.invoice_number.toLowerCase().includes(qn) ||
        cname.includes(qn) ||
        inv.issue_date.includes(qn) ||
        String(inv.total_ttc).includes(qn)
      )
    })
  }, [q.data, range, slice.clientId, slice.query, invoiceStatus, clientNameById])

  const grouped = useMemo(() => {
    const loc = i18n.language === 'en' ? enUS : fr
    const map = new Map<string, Invoice[]>()
    for (const inv of filtered) {
      const key = inv.issue_date.slice(0, 7)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(inv)
    }
    const keys = [...map.keys()].sort((a, b) => b.localeCompare(a))
    return keys.map((k) => ({
      key: k,
      label: format(parseISO(`${k}-01`), 'MMMM yyyy', { locale: loc }),
      rows: map.get(k)!,
    }))
  }, [filtered, i18n.language])

  const totals = useMemo(() => {
    let ht = 0
    let ttc = 0
    for (const inv of filtered) {
      ht += inv.subtotal_ht
      ttc += inv.total_ttc
    }
    return { ht, ttc, count: filtered.length }
  }, [filtered])

  const numLocale = i18n.language === 'en' ? 'en-US' : 'fr-FR'

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t('invoices.title')}</h1>
          <p className="text-muted-foreground">{t('invoices.listSubtitle')}</p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">{rangeLabel}</p>
        </div>
        <Button asChild>
          <Link to="/invoices/new">
            <Plus className="h-4 w-4" />
            {t('invoices.new')}
          </Link>
        </Button>
      </div>

      <ReportingFiltersCard
        variant="invoices"
        period={slice.period}
        onPeriodChange={(p) => commit({ period: p })}
        search={searchDraft}
        onSearchChange={setSearchDraft}
        clientId={slice.clientId}
        onClientIdChange={(id) => commit({ clientId: id })}
        clients={clientsQuery.data ?? []}
        invoiceStatus={invoiceStatus}
        onInvoiceStatusChange={(s) => commit({ invoiceStatus: s })}
      />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm">
        <span className="font-medium text-foreground">{t('invoices.listTotals', { count: totals.count })}</span>
        <span className="text-muted-foreground">·</span>
        <span className="tabular-nums text-foreground">
          {t('invoices.listTotalHt')}{' '}
          {new Intl.NumberFormat(numLocale, { style: 'currency', currency: 'EUR' }).format(totals.ht)}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="tabular-nums text-foreground">
          {t('invoices.listTotalTtc')}{' '}
          {new Intl.NumberFormat(numLocale, { style: 'currency', currency: 'EUR' }).format(totals.ttc)}
        </span>
      </div>

      <Card className="border-border/80">
        <CardHeader>
          <CardTitle>{t('invoices.listTitle')}</CardTitle>
          <CardDescription>{t('invoices.listDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {q.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : grouped.length ? (
            grouped.map((g) => (
              <div key={g.key} className="space-y-2">
                <p className="sticky top-0 z-10 -mx-1 bg-background/95 px-1 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/80">
                  {g.label}
                </p>
                <div className="space-y-2">
                  {g.rows.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{inv.invoice_number}</p>
                          <Badge variant={invoiceStatusBadgeVariant(inv.status)} className="text-xs font-normal">
                            {t(invoiceStatusLabelKey(inv.status))}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {inv.issue_date} · {clientNameById.get(inv.client_id) ?? '—'} · {inv.currency}
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
                          {new Intl.NumberFormat(numLocale, { style: 'currency', currency: inv.currency }).format(
                            inv.total_ttc,
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              {slice.query.trim() || slice.clientId || invoiceStatus !== 'all'
                ? t('invoices.listEmptyFiltered')
                : t('invoices.listEmpty')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
