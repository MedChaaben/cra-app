import { CalendarRange, Filter, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { ReportingPeriodState, ReportingPreset } from '@/lib/reportingPeriod'
import type { Client } from '@/types/models'

type InvoiceStatusFilter = 'all' | 'pending' | 'paid' | 'archived'
type TimesheetStatusFilter = 'all' | 'draft' | 'parsed' | 'validated'

export type ReportingFiltersCardProps = {
  period: ReportingPeriodState
  onPeriodChange: (next: ReportingPeriodState) => void
  search: string
  onSearchChange: (q: string) => void
  clientId: string | null
  onClientIdChange: (id: string | null) => void
  clients: Client[]
  /** Factures ou CRA : filtre par statut métier */
  variant: 'dashboard' | 'invoices' | 'timesheets'
  invoiceStatus?: InvoiceStatusFilter
  onInvoiceStatusChange?: (s: InvoiceStatusFilter) => void
  timesheetStatus?: TimesheetStatusFilter
  onTimesheetStatusChange?: (s: TimesheetStatusFilter) => void
  className?: string
}

const PRESETS: ReportingPreset[] = ['all', 'year', 'quarter', 'custom']

function yearOptions(anchorYear: number, span = 8): number[] {
  const out: number[] = []
  for (let y = anchorYear + 1; y >= anchorYear - span; y -= 1) out.push(y)
  return out
}

export function ReportingFiltersCard({
  period,
  onPeriodChange,
  search,
  onSearchChange,
  clientId,
  onClientIdChange,
  clients,
  variant,
  invoiceStatus = 'all',
  onInvoiceStatusChange,
  timesheetStatus = 'all',
  onTimesheetStatusChange,
  className,
}: ReportingFiltersCardProps) {
  const { t } = useTranslation()
  const now = new Date()
  const years = yearOptions(now.getFullYear())

  return (
    <Card className={cn('border-border/80 shadow-sm', className)}>
      <CardContent className="space-y-5 pt-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <CalendarRange className="h-4 w-4 text-muted-foreground" />
            {t('reporting.periodTitle')}
          </div>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('reporting.periodTitle')}>
            {PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                size="sm"
                variant={period.preset === preset ? 'default' : 'outline'}
                className="rounded-full"
                onClick={() => onPeriodChange({ ...period, preset })}
              >
                {t(`reporting.preset.${preset}`)}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {period.preset === 'year' || period.preset === 'quarter' ? (
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">{t('reporting.fieldYear')}</Label>
                <Select
                  value={String(period.year)}
                  onValueChange={(v) => onPeriodChange({ ...period, year: Number(v) })}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {period.preset === 'quarter' ? (
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">{t('reporting.fieldQuarter')}</Label>
                <Select
                  value={String(period.quarter)}
                  onValueChange={(v) =>
                    onPeriodChange({ ...period, quarter: Number(v) as ReportingPeriodState['quarter'] })
                  }
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {t('reporting.quarterShort', { n })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {period.preset === 'custom' ? (
              <>
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t('reporting.fieldFrom')}</Label>
                  <Input
                    type="date"
                    className="w-[160px]"
                    value={period.customFrom}
                    onChange={(e) => onPeriodChange({ ...period, customFrom: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t('reporting.fieldTo')}</Label>
                  <Input
                    type="date"
                    className="w-[160px]"
                    value={period.customTo}
                    onChange={(e) => onPeriodChange({ ...period, customTo: e.target.value })}
                  />
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div className="h-px bg-border" />

        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Search className="h-3.5 w-3.5" />
              {t('reporting.search')}
            </Label>
            <Input
              placeholder={t('reporting.searchPlaceholder')}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="max-w-xl"
            />
          </div>
          <div className="grid min-w-[200px] flex-1 gap-1.5 sm:max-w-xs">
            <Label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              {t('reporting.client')}
            </Label>
            <Select
              value={clientId ?? '__all__'}
              onValueChange={(v) => onClientIdChange(v === '__all__' ? null : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('reporting.clientAll')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t('reporting.clientAll')}</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {variant === 'invoices' && onInvoiceStatusChange ? (
            <div className="grid min-w-[180px] gap-1.5 sm:max-w-xs">
              <Label className="text-xs text-muted-foreground">{t('reporting.invoiceStatus')}</Label>
              <Select value={invoiceStatus} onValueChange={(v) => onInvoiceStatusChange(v as InvoiceStatusFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('reporting.statusAll')}</SelectItem>
                  <SelectItem value="pending">{t('reporting.invoiceStatusPending')}</SelectItem>
                  <SelectItem value="paid">{t('invoices.status.paid')}</SelectItem>
                  <SelectItem value="archived">{t('invoices.status.archived')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {variant === 'timesheets' && onTimesheetStatusChange ? (
            <div className="grid min-w-[180px] gap-1.5 sm:max-w-xs">
              <Label className="text-xs text-muted-foreground">{t('reporting.timesheetStatus')}</Label>
              <Select value={timesheetStatus} onValueChange={(v) => onTimesheetStatusChange(v as TimesheetStatusFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('reporting.statusAll')}</SelectItem>
                  <SelectItem value="draft">{t('timesheets.status.draft')}</SelectItem>
                  <SelectItem value="parsed">{t('timesheets.status.parsed')}</SelectItem>
                  <SelectItem value="validated">{t('timesheets.status.validated')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
