import { FileSpreadsheet, Plus, Receipt, TrendingUp } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useDashboardStats } from '@/hooks/useDashboardStats'
import { useTimesheets } from '@/hooks/useTimesheets'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase/client'
import { useQuery } from '@tanstack/react-query'
import type { Invoice } from '@/types/models'

export default function DashboardPage() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const stats = useDashboardStats(user?.id)
  const timesheets = useTimesheets(user?.id)

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

  const invoices = useQuery({
    queryKey: ['invoices', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<Invoice[]> => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(6)
      if (error) throw error
      return (data ?? []) as Invoice[]
    },
  })

  const d = stats.data

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t('dashboard.title')}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{t('dashboard.subtitle')}</p>
        </div>
        <Button asChild className="shrink-0 shadow-md shadow-primary/20">
          <Link to="/import">
            <Plus className="h-4 w-4" />
            {t('nav.import')}
          </Link>
        </Button>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('dashboard.sectionActivity')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label={t('dashboard.revenueMonth')}
            value={d ? fmt.moneyHt(d.revenueMonthHt) : undefined}
            loading={stats.isLoading}
          />
          <MetricCard
            label={t('dashboard.revenueYear')}
            value={d ? fmt.moneyHt(d.revenueYearHt) : undefined}
            loading={stats.isLoading}
          />
          <MetricCard
            label={t('dashboard.soldDays')}
            value={d ? fmt.days(d.soldDaysYear) : undefined}
            sub={
              d
                ? t('dashboard.soldDaysSub', {
                    month: fmt.days(d.soldDaysMonth),
                    year: fmt.days(d.soldDaysYear),
                  })
                : undefined
            }
            loading={stats.isLoading}
          />
          <MetricCard
            label={t('dashboard.avgTjm')}
            hint={t('dashboard.avgTjmHint')}
            value={d ? fmt.moneyHtPrecise(d.avgDailyRateYtd) : undefined}
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
            label={t('dashboard.avgMonthlyRevenue')}
            hint={t('dashboard.avgMonthlyRevenueHint')}
            value={d ? fmt.moneyHt(d.avgMonthlyRevenueYtdHt) : undefined}
            loading={stats.isLoading}
          />
          <MetricCard
            label={t('dashboard.yearProjection')}
            hint={t('dashboard.yearProjectionHint')}
            value={d ? fmt.moneyHt(d.yearEndProjectionHt) : undefined}
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
            label={t('dashboard.gapToInvoice')}
            hint={t('dashboard.gapToInvoiceHint')}
            value={d ? fmt.moneyHt(d.gapToInvoiceHt) : undefined}
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
            value={d ? String(d.timesheetCount) : undefined}
            loading={stats.isLoading}
          />
          <MetricCard
            label={t('dashboard.invoices')}
            value={d ? String(d.invoiceCount) : undefined}
            loading={stats.isLoading}
          />
          <Card className="border-primary/25 bg-gradient-to-br from-primary/5 to-card sm:col-span-2 lg:col-span-1">
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
        </div>
      </section>

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
            ) : timesheets.data?.length ? (
              timesheets.data.map((ts) => (
                <Link
                  key={ts.id}
                  to={`/timesheets/${ts.id}/edit`}
                  className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-3 text-sm transition-colors hover:bg-muted/60"
                >
                  <div>
                    <p className="font-medium">{ts.title}</p>
                    <p className="text-xs text-muted-foreground">{new Date(ts.created_at).toLocaleDateString()}</p>
                  </div>
                  <Badge variant={ts.status === 'validated' ? 'success' : 'secondary'}>{ts.status}</Badge>
                </Link>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
                {t('dashboard.emptyTimesheets')}
              </div>
            )}
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
            ) : invoices.data?.length ? (
              invoices.data.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium">{inv.invoice_number}</p>
                    <p className="text-xs text-muted-foreground">{inv.issue_date}</p>
                  </div>
                  <span className="font-medium tabular-nums">
                    {new Intl.NumberFormat(i18n.language === 'en' ? 'en-US' : 'fr-FR', {
                      style: 'currency',
                      currency: inv.currency,
                    }).format(inv.total_ttc)}
                  </span>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
                {t('dashboard.emptyInvoices')}
              </div>
            )}
            <Button asChild variant="outline" className="mt-2 w-full">
              <Link to="/invoices">{t('invoices.title')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
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
