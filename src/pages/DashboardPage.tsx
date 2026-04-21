import { format, parseISO } from 'date-fns'
import { enUS, fr } from 'date-fns/locale'
import { AlertTriangle, ArrowUpRight, FileSpreadsheet, Plus, Receipt } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { CraOuvreSummary } from '@/components/cra/CraOuvreSummary'
import { ReportingFiltersCard } from '@/components/reporting/ReportingFiltersCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useClients } from '@/hooks/useClients'
import { useDashboardStats } from '@/hooks/useDashboardStats'
import { useDebounced } from '@/hooks/useDebounced'
import { useListReportingUrl } from '@/hooks/useListReportingUrl'
import { useTimesheets } from '@/hooks/useTimesheets'
import { resolveCraStatsMonth } from '@/lib/craOuvreStats'
import { dateInRange, resolveReportingRange, type ClosedDateRange } from '@/lib/reportingPeriod'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase/client'
import { useQuery } from '@tanstack/react-query'
import type { Invoice } from '@/types/models'

export default function DashboardPage() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const { slice, commit } = useListReportingUrl()
  const [searchDraft, setSearchDraft] = useState(slice.query)
  const clientsQuery = useClients(user?.id)
  const stats = useDashboardStats(user?.id, slice.period, slice.clientId)
  const timesheets = useTimesheets(user?.id)

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

  const fmt = useMemo(() => {
    const loc = i18n.language === 'en' ? 'en-US' : 'fr-FR'
    return {
      moneyHt: (n: number) =>
        new Intl.NumberFormat(loc, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n),
      moneyHtPrecise: (n: number) =>
        new Intl.NumberFormat(loc, { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n),
      moneyTtc: (n: number) =>
        new Intl.NumberFormat(loc, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n),
      days: (n: number) => n.toLocaleString(loc, { maximumFractionDigits: 2 }),
    }
  }, [i18n.language])

  const clientNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of clientsQuery.data ?? []) {
      m.set(c.id, c.name)
    }
    return m
  }, [clientsQuery.data])

  const invoices = useQuery({
    queryKey: ['invoices', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<Invoice[]> => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Invoice[]
    },
  })

  const d = stats.data
  const allowedTs = useMemo(() => new Set(d?.timesheetIdsInPeriod ?? []), [d?.timesheetIdsInPeriod])

  const qnorm = slice.query.trim().toLowerCase()

  const filteredTimesheets = useMemo(() => {
    const rows = timesheets.data ?? []
    return rows.filter((ts) => {
      if (!allowedTs.has(ts.id)) return false
      if (!qnorm) return true
      return ts.title.toLowerCase().includes(qnorm) || (ts.month_year ?? '').toLowerCase().includes(qnorm)
    })
  }, [timesheets.data, allowedTs, qnorm])

  const filteredInvoices = useMemo(() => {
    const rows = invoices.data ?? []
    return rows.filter((inv) => {
      if (slice.clientId && inv.client_id !== slice.clientId) return false
      if (!dateInRange(inv.issue_date, range as ClosedDateRange | null)) return false
      if (!qnorm) return true
      const cname = (clientNameById.get(inv.client_id) ?? '').toLowerCase()
      return (
        inv.invoice_number.toLowerCase().includes(qnorm) ||
        cname.includes(qnorm) ||
        inv.issue_date.includes(qnorm) ||
        inv.currency.toLowerCase().includes(qnorm)
      )
    })
  }, [invoices.data, slice.clientId, range, qnorm, clientNameById])

  const hasLate = Boolean(d && d.latePaymentCount > 0)
  const gapAttention = Boolean(d && d.gapToInvoiceHt > 0)

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{t('dashboard.title')}</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{t('dashboard.subtitleFiltered')}</p>
          <p className="text-xs font-medium tabular-nums text-muted-foreground/90">{rangeLabel}</p>
        </div>
        <Button asChild className="shrink-0 shadow-md shadow-primary/15">
          <Link to="/import">
            <Plus className="h-4 w-4" />
            {t('nav.import')}
          </Link>
        </Button>
      </div>

      <ReportingFiltersCard
        variant="dashboard"
        period={slice.period}
        onPeriodChange={(p) => commit({ period: p })}
        search={searchDraft}
        onSearchChange={setSearchDraft}
        clientId={slice.clientId}
        onClientIdChange={(id) => commit({ clientId: id })}
        clients={clientsQuery.data ?? []}
      />

      <section className="space-y-4">
        <h2 className="sr-only">{t('dashboard.sectionActivity')}</h2>
        <Card className="overflow-hidden border-border/70 shadow-sm">
          <div className="grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <div className="relative space-y-4 p-6 sm:p-8 lg:border-r lg:border-border/60">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {t('dashboard.heroRevenueLabel')}
                </p>
                <div className="mt-3">
                  {stats.isLoading ? (
                    <Skeleton className="h-12 w-48 max-w-full sm:h-14 sm:w-56" />
                  ) : (
                    <p className="text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
                      {d ? fmt.moneyHt(d.craRevenueHt) : '—'}
                    </p>
                  )}
                </div>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                  {t('dashboard.heroRevenueHint')}
                </p>
              </div>

              {d?.yearEndProjectionHt != null ? (
                <div className="rounded-lg border border-primary/20 bg-primary/[0.06] px-4 py-3 text-sm">
                  <p className="font-medium text-foreground">{t('dashboard.yearProjection')}</p>
                  <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-lg font-semibold tabular-nums text-primary">
                      {fmt.moneyHt(d.yearEndProjectionHt)}
                    </span>
                    <span className="text-xs text-muted-foreground">{t('dashboard.yearProjectionHint')}</span>
                  </p>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col justify-center bg-muted/25 p-6 sm:p-8">
              <StatLine
                label={t('dashboard.statTjm')}
                loading={stats.isLoading}
                value={d ? fmt.moneyHtPrecise(d.avgDailyRate) : undefined}
              />
              <Separator className="my-1 bg-border/60" />
              <StatLine
                label={t('dashboard.statSoldDays')}
                loading={stats.isLoading}
                value={d ? fmt.days(d.soldDays) : undefined}
                detail={d ? t('dashboard.statDaysDetail', { days: fmt.days(d.soldDays) }) : undefined}
              />
              <Separator className="my-1 bg-border/60" />
              <StatLine
                label={t('dashboard.statAvgMonth')}
                loading={stats.isLoading}
                value={d ? fmt.moneyHt(d.avgMonthlyRevenueHt) : undefined}
                detail={t('dashboard.statAvgMonthHint')}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/15 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('dashboard.topClient')}
              </p>
              {stats.isLoading ? (
                <Skeleton className="h-6 w-44" />
              ) : d && d.topClientRevenueHt > 0 ? (
                <p className="truncate text-sm font-medium text-foreground">
                  <span className="text-muted-foreground">{t('dashboard.topClientShare')} </span>
                  {d.topClientUnassigned ? t('dashboard.topClientUnassigned') : (d.topClientName ?? '—')}
                  <span className="ml-2 tabular-nums text-primary">{fmt.moneyHt(d.topClientRevenueHt)} HT</span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">{t('dashboard.topClientNone')}</p>
              )}
            </div>
            <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {stats.isLoading ? <Skeleton className="h-4 w-36" /> : d ? t('dashboard.sheetsInPeriod', { count: d.timesheetsInPeriod }) : null}
            </p>
          </div>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{t('dashboard.sectionBilling')}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-semibold uppercase tracking-wide">
                {t('dashboard.billIssuedTitle')}
              </CardDescription>
              <CardTitle className="pt-1 text-2xl font-semibold tabular-nums sm:text-3xl">
                {stats.isLoading ? <Skeleton className="h-9 w-32" /> : d ? fmt.moneyTtc(d.invoicesTtcInPeriod) : '—'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs text-muted-foreground">
              <p>{t('dashboard.billIssuedHint')}</p>
              {d ? (
                <p className="font-medium text-foreground/80">
                  {t('dashboard.billIssuedMeta', {
                    count: d.invoicesCountInPeriod,
                    ht: fmt.moneyHt(d.invoicesHtInPeriod),
                  })}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card
            className={cn(
              'border-border/70 shadow-sm transition-colors',
              gapAttention && 'border-amber-500/35 bg-amber-500/[0.04]',
            )}
          >
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-semibold uppercase tracking-wide">
                {t('dashboard.gapToInvoice')}
              </CardDescription>
              <CardTitle className="pt-1 text-2xl font-semibold tabular-nums sm:text-3xl">
                {stats.isLoading ? <Skeleton className="h-9 w-32" /> : d ? fmt.moneyHt(d.gapToInvoiceHt) : '—'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs leading-relaxed text-muted-foreground">{t('dashboard.gapToInvoiceHint')}</p>
            </CardContent>
          </Card>

          <Card
            className={cn(
              'border-border/70 shadow-sm transition-colors',
              hasLate && 'border-destructive/40 bg-destructive/[0.04]',
            )}
          >
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <div className="space-y-1">
                <CardDescription className="text-xs font-semibold uppercase tracking-wide">
                  {t('dashboard.latePayments')}
                </CardDescription>
                <CardTitle
                  className={cn(
                    'pt-1 text-xl font-semibold leading-snug sm:text-2xl',
                    hasLate ? 'text-destructive' : 'text-foreground',
                  )}
                >
                  {stats.isLoading ? (
                    <Skeleton className="h-8 w-36" />
                  ) : d && d.latePaymentCount > 0 ? (
                    t('dashboard.latePaymentsSub', {
                      count: d.latePaymentCount,
                      amount: fmt.moneyTtc(d.latePaymentAmountTtc),
                    })
                  ) : (
                    t('dashboard.latePaymentsNone')
                  )}
                </CardTitle>
              </div>
              {hasLate ? <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-destructive" aria-hidden /> : null}
            </CardHeader>
            <CardContent>
              {d && d.latePaymentCount > 0 ? (
                <p className="text-[11px] leading-relaxed text-muted-foreground">{t('dashboard.latePaymentsMixedCurrency')}</p>
              ) : (
                <p className="text-xs text-muted-foreground">{t('dashboard.latePaymentsHint')}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">{t('dashboard.sectionLists')}</h2>
          <p className="text-xs text-muted-foreground">
            {t('dashboard.listCounts', { ts: filteredTimesheets.length, inv: filteredInvoices.length })}
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="overflow-hidden border-border/70 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-base font-semibold">{t('dashboard.timesheets')}</CardTitle>
                <CardDescription className="mt-1">{t('dashboard.timesheetsListHint')}</CardDescription>
              </div>
              <FileSpreadsheet className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            </CardHeader>
            <CardContent className="space-y-2">
              {timesheets.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : filteredTimesheets.length ? (
                filteredTimesheets.slice(0, 8).map((ts) => (
                  <Link
                    key={ts.id}
                    to={`/timesheets/${ts.id}/edit`}
                    className="group flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-card px-3 py-3 text-sm shadow-sm transition-colors hover:border-border hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="truncate font-medium leading-snug">{ts.title}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <p className="text-xs text-muted-foreground">
                          {[ts.month_year, new Date(ts.created_at).toLocaleDateString()].filter(Boolean).join(' · ')}
                        </p>
                        {(() => {
                          const ym = resolveCraStatsMonth(ts.month_year, ts.timesheet_entries ?? [])
                          return ym ? (
                            <CraOuvreSummary
                              variant="inline"
                              year={ym.y}
                              month={ym.m}
                              entries={ts.timesheet_entries ?? []}
                              className="w-full min-w-0 sm:max-w-[20rem]"
                            />
                          ) : null
                        })()}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge variant={ts.status === 'validated' ? 'success' : 'secondary'}>{ts.status}</Badge>
                      <ArrowUpRight
                        className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                        aria-hidden
                      />
                    </div>
                  </Link>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
                  {qnorm || slice.clientId ? t('dashboard.emptyFilteredList') : t('dashboard.emptyTimesheets')}
                </div>
              )}
              <Button asChild variant="outline" className="mt-2 w-full">
                <Link to="/timesheets">{t('dashboard.linkAllTimesheets')}</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border/70 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-base font-semibold">{t('dashboard.invoices')}</CardTitle>
                <CardDescription className="mt-1">{t('dashboard.invoicesListHint')}</CardDescription>
              </div>
              <Receipt className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            </CardHeader>
            <CardContent className="space-y-2">
              {invoices.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : filteredInvoices.length ? (
                filteredInvoices.slice(0, 8).map((inv) => (
                  <Link
                    key={inv.id}
                    to={`/invoices/${inv.id}`}
                    className="group flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card px-3 py-3 text-sm shadow-sm transition-colors hover:border-border hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{inv.invoice_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {inv.issue_date} · {clientNameById.get(inv.client_id) ?? '—'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-medium tabular-nums">
                        {new Intl.NumberFormat(i18n.language === 'en' ? 'en-US' : 'fr-FR', {
                          style: 'currency',
                          currency: inv.currency,
                        }).format(inv.total_ttc)}
                      </span>
                      <ArrowUpRight
                        className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                        aria-hidden
                      />
                    </div>
                  </Link>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
                  {qnorm || slice.clientId ? t('dashboard.emptyFilteredList') : t('dashboard.emptyInvoices')}
                </div>
              )}
              <Button asChild variant="outline" className="mt-2 w-full">
                <Link to="/invoices">{t('dashboard.linkAllInvoices')}</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}

function StatLine({
  label,
  value,
  detail,
  loading,
}: {
  label: string
  value: string | undefined
  detail?: string
  loading: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <div className="min-w-0 pt-0.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        {detail ? <p className="mt-1 text-[11px] leading-snug text-muted-foreground/90">{detail}</p> : null}
      </div>
      <div className="shrink-0 text-right">
        {loading ? <Skeleton className="ml-auto h-8 w-28" /> : <p className="text-xl font-semibold tabular-nums sm:text-2xl">{value ?? '—'}</p>}
      </div>
    </div>
  )
}
