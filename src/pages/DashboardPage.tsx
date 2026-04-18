import { format, parseISO } from 'date-fns'
import { enUS, fr } from 'date-fns/locale'
import { FileSpreadsheet, Plus, Receipt, TrendingUp } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { ReportingFiltersCard } from '@/components/reporting/ReportingFiltersCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useClients } from '@/hooks/useClients'
import { useDashboardStats } from '@/hooks/useDashboardStats'
import { useDebounced } from '@/hooks/useDebounced'
import { useListReportingUrl } from '@/hooks/useListReportingUrl'
import { useTimesheets } from '@/hooks/useTimesheets'
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
    // Synchronise le champ quand l’URL change (navigation / lien partagé).
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

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t('dashboard.title')}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{t('dashboard.subtitleFiltered')}</p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">{rangeLabel}</p>
        </div>
        <Button asChild className="shrink-0 shadow-md shadow-primary/20">
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

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('dashboard.sectionActivity')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label={t('dashboard.metricCraRevenue')}
            hint={t('dashboard.metricCraRevenueHint')}
            value={d ? fmt.moneyHt(d.craRevenueHt) : undefined}
            loading={stats.isLoading}
          />
          <MetricCard
            label={t('dashboard.metricSoldDays')}
            hint={t('dashboard.metricSoldDaysHint', { hours: d ? fmt.days(d.craHours) : '—' })}
            value={d ? fmt.days(d.soldDays) : undefined}
            loading={stats.isLoading}
          />
          <MetricCard
            label={t('dashboard.metricAvgTjm')}
            hint={t('dashboard.metricAvgTjmHint')}
            value={d ? fmt.moneyHtPrecise(d.avgDailyRate) : undefined}
            loading={stats.isLoading}
          />
          <MetricCard
            label={t('dashboard.metricAvgMonthly')}
            hint={t('dashboard.metricAvgMonthlyHint')}
            value={d ? fmt.moneyHt(d.avgMonthlyRevenueHt) : undefined}
            loading={stats.isLoading}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('dashboard.sectionBilling')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label={t('dashboard.metricInvoicesCount')}
            hint={t('dashboard.metricInvoicesCountHint')}
            value={d ? String(d.invoicesCountInPeriod) : undefined}
            loading={stats.isLoading}
          />
          <MetricCard
            label={t('dashboard.metricInvoicesTtc')}
            hint={t('dashboard.metricInvoicesTtcHint')}
            value={d ? fmt.moneyTtc(d.invoicesTtcInPeriod) : undefined}
            loading={stats.isLoading}
          />
          <MetricCard
            label={t('dashboard.latePayments')}
            value={
              d
                ? d.latePaymentCount > 0
                  ? t('dashboard.latePaymentsSub', {
                      count: d.latePaymentCount,
                      amount: fmt.moneyTtc(d.latePaymentAmountTtc),
                    })
                  : t('dashboard.latePaymentsNone')
                : undefined
            }
            hint={d && d.latePaymentCount > 0 ? t('dashboard.latePaymentsMixedCurrency') : undefined}
            loading={stats.isLoading}
            multilineValue
          />
          <MetricCard
            label={t('dashboard.yearProjection')}
            hint={
              d?.yearEndProjectionHt != null ? t('dashboard.yearProjectionHint') : t('dashboard.yearProjectionNone')
            }
            value={d?.yearEndProjectionHt != null ? fmt.moneyHt(d.yearEndProjectionHt) : '—'}
            loading={stats.isLoading}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('dashboard.sectionSummary')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            label={t('dashboard.timesheets')}
            value={d ? String(d.timesheetsInPeriod) : undefined}
            loading={stats.isLoading}
          />
          <MetricCard
            label={t('dashboard.invoices')}
            value={d ? String(d.invoicesCountInPeriod) : undefined}
            loading={stats.isLoading}
          />
          <MetricCard
            label={t('dashboard.gapToInvoice')}
            hint={t('dashboard.gapToInvoiceHint')}
            value={d ? fmt.moneyHt(d.gapToInvoiceHt) : undefined}
            loading={stats.isLoading}
          />
        </div>
        <Card className="border-primary/25 bg-gradient-to-br from-primary/5 to-card">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <CardDescription>{t('dashboard.topClient')}</CardDescription>
              </div>
              <CardTitle className="text-xl font-semibold leading-tight">
                {stats.isLoading ? (
                  <Skeleton className="h-7 w-40" />
                ) : d && d.topClientRevenueHt > 0 ? (
                  <>
                    <span className="block truncate">
                      {d.topClientUnassigned ? t('dashboard.topClientUnassigned') : (d.topClientName ?? '—')}
                    </span>
                    <span className="mt-1 block text-base font-medium tabular-nums text-primary">
                      {fmt.moneyHt(d.topClientRevenueHt)} HT
                    </span>
                  </>
                ) : (
                  <span className="text-base font-normal text-muted-foreground">{t('dashboard.topClientNone')}</span>
                )}
              </CardTitle>
            </CardHeader>
          </Card>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t('dashboard.sectionLists')}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t('dashboard.listCounts', { ts: filteredTimesheets.length, inv: filteredInvoices.length })}
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="overflow-hidden border-border/80">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-base font-semibold">{t('dashboard.timesheets')}</CardTitle>
                <CardDescription>{t('dashboard.emptyTimesheets')}</CardDescription>
              </div>
              <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-2">
              {timesheets.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : filteredTimesheets.length ? (
                filteredTimesheets.slice(0, 8).map((ts) => (
                  <Link
                    key={ts.id}
                    to={`/timesheets/${ts.id}/edit`}
                    className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-3 text-sm transition-colors hover:bg-muted/60"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{ts.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {[ts.month_year, new Date(ts.created_at).toLocaleDateString()].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <Badge variant={ts.status === 'validated' ? 'success' : 'secondary'}>{ts.status}</Badge>
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

          <Card className="overflow-hidden border-border/80">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-base font-semibold">{t('dashboard.invoices')}</CardTitle>
                <CardDescription>{t('dashboard.emptyInvoices')}</CardDescription>
              </div>
              <Receipt className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-2">
              {invoices.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : filteredInvoices.length ? (
                filteredInvoices.slice(0, 8).map((inv) => (
                  <Link
                    key={inv.id}
                    to={`/invoices/${inv.id}`}
                    className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-3 text-sm transition-colors hover:bg-muted/60"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{inv.invoice_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {inv.issue_date} · {clientNameById.get(inv.client_id) ?? '—'}
                      </p>
                    </div>
                    <span className="shrink-0 pl-2 font-medium tabular-nums">
                      {new Intl.NumberFormat(i18n.language === 'en' ? 'en-US' : 'fr-FR', {
                        style: 'currency',
                        currency: inv.currency,
                      }).format(inv.total_ttc)}
                    </span>
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

function MetricCard({
  label,
  value,
  sub,
  hint,
  loading,
  multilineValue,
}: {
  label: string
  value: string | undefined
  sub?: string
  hint?: string
  loading: boolean
  multilineValue?: boolean
}) {
  return (
    <Card className={cn('border-border/80 bg-gradient-to-br from-card to-muted/30')}>
      <CardHeader className="space-y-1 pb-2">
        <CardDescription>{label}</CardDescription>
        {hint ? <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p> : null}
        <CardTitle
          className={cn(
            'text-xl font-semibold tabular-nums sm:text-2xl',
            multilineValue && value && 'whitespace-pre-wrap text-base font-medium leading-snug sm:text-lg',
          )}
        >
          {loading ? <Skeleton className="h-8 w-28" /> : (value ?? '—')}
        </CardTitle>
        {sub && !loading ? <CardDescription className="pt-0.5 text-xs">{sub}</CardDescription> : null}
      </CardHeader>
    </Card>
  )
}
