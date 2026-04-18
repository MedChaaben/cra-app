import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { enUS, fr } from 'date-fns/locale'
import { ChevronRight, FileSpreadsheet, Plus } from 'lucide-react'
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
import { useDebounced } from '@/hooks/useDebounced'
import { useListReportingUrl } from '@/hooks/useListReportingUrl'
import { resolveReportingRange, timesheetMatchesReportingRange } from '@/lib/reportingPeriod'
import { supabase } from '@/lib/supabase/client'
import type { Timesheet, TimesheetStatus } from '@/types/models'

type TimesheetRow = Timesheet & {
  timesheet_entries: { work_date: string | null; client_id: string | null }[] | null
}

function statusBadgeVariant(s: TimesheetStatus): 'default' | 'secondary' | 'outline' | 'success' {
  if (s === 'validated') return 'success'
  if (s === 'parsed') return 'secondary'
  return 'outline'
}

export default function TimesheetsPage() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
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

  const tsStatus = (slice.timesheetStatus as 'all' | TimesheetStatus) || 'all'

  const q = useQuery({
    queryKey: ['timesheets-with-entries', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<TimesheetRow[]> => {
      const { data, error } = await supabase
        .from('timesheets')
        .select('*, timesheet_entries(work_date, client_id)')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as TimesheetRow[]
    },
  })

  const clientNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of clientsQuery.data ?? []) {
      m.set(c.id, c.name)
    }
    return m
  }, [clientsQuery.data])

  const filtered = useMemo(() => {
    const rows = q.data ?? []
    const qn = slice.query.trim().toLowerCase()
    return rows.filter((ts) => {
      const entries = ts.timesheet_entries ?? []
      const datesForMatch = slice.clientId
        ? entries.filter((e) => e.client_id === slice.clientId).map((e) => e.work_date)
        : entries.map((e) => e.work_date)
      if (!timesheetMatchesReportingRange(ts, datesForMatch, range)) return false
      if (tsStatus !== 'all' && ts.status !== tsStatus) return false
      if (slice.clientId) {
        const hasClient = entries.some((e) => e.client_id === slice.clientId)
        if (!hasClient) return false
      }
      if (!qn) return true
      const clientHits = entries
        .map((e) => e.client_id && clientNameById.get(e.client_id))
        .filter(Boolean)
        .some((name) => String(name).toLowerCase().includes(qn))
      return (
        ts.title.toLowerCase().includes(qn) ||
        (ts.month_year ?? '').toLowerCase().includes(qn) ||
        ts.status.toLowerCase().includes(qn) ||
        clientHits
      )
    })
  }, [q.data, range, slice.clientId, slice.query, tsStatus, clientNameById])

  const grouped = useMemo(() => {
    const loc = i18n.language === 'en' ? enUS : fr
    const map = new Map<string, TimesheetRow[]>()
    for (const ts of filtered) {
      const key = ts.month_year?.slice(0, 7) ?? ts.created_at.slice(0, 7)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(ts)
    }
    const keys = [...map.keys()].sort((a, b) => b.localeCompare(a))
    return keys.map((k) => ({
      key: k,
      label: format(parseISO(`${k}-01`), 'MMMM yyyy', { locale: loc }),
      rows: map.get(k)!,
    }))
  }, [filtered, i18n.language])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t('timesheets.title')}</h1>
          <p className="text-muted-foreground">{t('timesheets.subtitle')}</p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">{rangeLabel}</p>
        </div>
        <Button asChild>
          <Link to="/import">
            <Plus className="h-4 w-4" />
            {t('nav.import')}
          </Link>
        </Button>
      </div>

      <ReportingFiltersCard
        variant="timesheets"
        period={slice.period}
        onPeriodChange={(p) => commit({ period: p })}
        search={searchDraft}
        onSearchChange={setSearchDraft}
        clientId={slice.clientId}
        onClientIdChange={(id) => commit({ clientId: id })}
        clients={clientsQuery.data ?? []}
        timesheetStatus={tsStatus}
        onTimesheetStatusChange={(s) => commit({ timesheetStatus: s })}
      />

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <FileSpreadsheet className="h-4 w-4" />
        {t('timesheets.resultsCount', { count: filtered.length })}
      </div>

      <Card className="border-border/80">
        <CardHeader>
          <CardTitle>{t('timesheets.listTitle')}</CardTitle>
          <CardDescription>{t('timesheets.listDescription')}</CardDescription>
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
                  {g.rows.map((ts) => (
                    <Link
                      key={ts.id}
                      to={`/timesheets/${ts.id}/edit`}
                      className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium leading-snug">{ts.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(ts.created_at).toLocaleDateString()} · {(ts.timesheet_entries ?? []).length}{' '}
                          {t('timesheets.lines')}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 sm:justify-end">
                        <Badge variant={statusBadgeVariant(ts.status)}>{t(`timesheets.status.${ts.status}`)}</Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              {slice.query.trim() || slice.clientId || tsStatus !== 'all'
                ? t('timesheets.listEmptyFiltered')
                : t('timesheets.listEmpty')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
