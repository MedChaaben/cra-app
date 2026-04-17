import { FileSpreadsheet, Plus, Receipt } from 'lucide-react'
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
  const { t } = useTranslation()
  const { user } = useAuth()
  const stats = useDashboardStats(user?.id)
  const timesheets = useTimesheets(user?.id)

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

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t('dashboard.title')}</h1>
          <p className="mt-2 max-w-xl text-muted-foreground">{t('dashboard.subtitle')}</p>
        </div>
        <Button asChild className="shrink-0 shadow-md shadow-primary/20">
          <Link to="/import">
            <Plus className="h-4 w-4" />
            {t('nav.import')}
          </Link>
        </Button>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={t('dashboard.hoursMonth')}
          value={stats.data ? `${stats.data.hoursMonth.toFixed(1)} h` : undefined}
          loading={stats.isLoading}
        />
        <MetricCard
          label={t('dashboard.revenueMonth')}
          value={
            stats.data
              ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(
                  stats.data.revenueMonthHt
                )
              : undefined
          }
          loading={stats.isLoading}
        />
        <MetricCard
          label={t('dashboard.timesheets')}
          value={stats.data ? String(stats.data.timesheetCount) : undefined}
          loading={stats.isLoading}
        />
        <MetricCard
          label={t('dashboard.invoices')}
          value={stats.data ? String(stats.data.invoiceCount) : undefined}
          loading={stats.isLoading}
        />
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
                    <p className="text-xs text-muted-foreground">
                      {new Date(ts.created_at).toLocaleDateString()}
                    </p>
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
                    {new Intl.NumberFormat(undefined, { style: 'currency', currency: inv.currency }).format(
                      inv.total_ttc
                    )}
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
  loading,
}: {
  label: string
  value: string | undefined
  loading: boolean
}) {
  return (
    <Card className={cn('border-border/80 bg-gradient-to-br from-card to-muted/30')}>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums">
          {loading ? <Skeleton className="h-8 w-24" /> : (value ?? '—')}
        </CardTitle>
      </CardHeader>
    </Card>
  )
}
