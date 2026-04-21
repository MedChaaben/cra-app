import { ArrowLeft, CalendarRange, Loader2, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { eachDayOfInterval, endOfMonth, format, getISODay, startOfMonth } from 'date-fns'
import { enUS, fr } from 'date-fns/locale'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/hooks/useAuth'
import { useClients } from '@/hooks/useClients'
import { getFrenchMetropolitanHolidayLabel } from '@/lib/frenchPublicHolidays'
import { buildManualMonthRows, getDayRowKind, summarizeManualMonth } from '@/lib/manualMonthRows'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase/client'

type Props = {
  onBack: () => void
}

const MONTH_KEYS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
] as const

export function ManualMonthForm({ onBack }: Props) {
  const { t, i18n } = useTranslation()
  const dfLocale = i18n.language?.startsWith('en') ? enUS : fr
  const { user } = useAuth()
  const navigate = useNavigate()
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState(() => new Date().getMonth() + 1)
  const [defaultProject, setDefaultProject] = useState('')
  const [defaultClient, setDefaultClient] = useState('')
  const [selectedClientId, setSelectedClientId] = useState<string>('none')
  const [defaultTjm, setDefaultTjm] = useState('')
  const [busy, setBusy] = useState(false)
  const clientsQuery = useClients(user?.id)

  const monthStart = useMemo(() => new Date(year, month - 1, 1), [year, month])
  const monthLabel = useMemo(
    () => format(monthStart, 'LLLL yyyy', { locale: dfLocale }),
    [monthStart, dfLocale],
  )
  const stats = useMemo(() => summarizeManualMonth(year, month), [year, month])

  const calendar = useMemo(() => {
    const start = startOfMonth(monthStart)
    const end = endOfMonth(monthStart)
    const days = eachDayOfInterval({ start, end })
    const lead = getISODay(start) - 1
    const cells: ({ type: 'empty' } | { type: 'day'; iso: string; dayNum: number })[] = [
      ...Array.from({ length: lead }, () => ({ type: 'empty' as const })),
      ...days.map((d) => ({
        type: 'day' as const,
        iso: format(d, 'yyyy-MM-dd'),
        dayNum: d.getDate(),
      })),
    ]
    const tail = (7 - (cells.length % 7)) % 7
    for (let i = 0; i < tail; i++) cells.push({ type: 'empty' })
    return cells
  }, [monthStart])

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear()
    return [y - 1, y, y + 1, y + 2]
  }, [])

  const onSubmit = async () => {
    if (!user) return
    const tjm = Number.parseFloat(defaultTjm.replace(',', '.'))
    const dailyRate = Number.isFinite(tjm) && tjm >= 0 ? tjm : 0
    setBusy(true)
    try {
      const selectedClient =
        selectedClientId !== 'none' ? (clientsQuery.data ?? []).find((c) => c.id === selectedClientId) : null
      const defaultClientName = selectedClient?.name ?? defaultClient.trim()
      const defaultClientId = selectedClient?.id ?? null

      const rows = buildManualMonthRows(year, month, {
        project: defaultProject.trim(),
        client: defaultClientName,
        dailyRate,
      })
      const monthYear = format(monthStart, 'yyyy-MM')
      const title = `${t('import.manualTimesheetPrefix')} ${monthLabel}`

      const { data: ts, error: tErr } = await supabase
        .from('timesheets')
        .insert({
          user_id: user.id,
          title,
          source_image_path: null,
          status: 'parsed',
          month_year: monthYear,
        })
        .select()
        .single()
      if (tErr) throw tErr

      const entries = rows.map((r) => ({
        timesheet_id: ts.id,
        work_date: r.work_date,
        project_name: r.project_name || null,
        client_name: r.client_name || null,
        client_id: defaultClientId,
        hours: r.hours,
        daily_rate: r.daily_rate,
        comment: r.comment,
        ocr_confidence: null,
        sort_order: r.sort_order,
      }))

      const { error: eErr } = await supabase.from('timesheet_entries').insert(entries)
      if (eErr) throw eErr

      toast.success(t('import.manualCreatedToast'))
      void navigate(`/timesheets/${ts.id}/edit`)
    } catch (e) {
      console.error(e)
      toast.error(t('import.manualCreateError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start gap-4">
        <Button type="button" variant="ghost" size="sm" className="-ml-2 gap-1 text-muted-foreground" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          {t('import.back')}
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{t('import.manualTitle')}</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t('import.manualSubtitle')}</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border/80 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <Sparkles className="h-4 w-4 shrink-0 text-amber-500/90" />
          {t('import.manualHint')}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-medium">{t('import.manualFormTitle')}</CardTitle>
            <CardDescription>{t('import.manualFormDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('import.fieldMonth')}</Label>
                <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                  <SelectTrigger className="bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_KEYS.map((key, i) => (
                      <SelectItem key={key} value={String(i + 1)}>
                        {t(`import.months.${key}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('import.fieldYear')}</Label>
                <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                  <SelectTrigger className="bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2 sm:col-span-1">
                <Label htmlFor="def-mission">{t('import.defaultMission')}</Label>
                <Input
                  id="def-mission"
                  placeholder={t('import.defaultMissionPh')}
                  value={defaultProject}
                  onChange={(e) => setDefaultProject(e.target.value)}
                  className="bg-card"
                />
              </div>
              <div className="space-y-2 sm:col-span-1">
                <Label htmlFor="def-client">{t('import.defaultClient')}</Label>
                <Input
                  id="def-client"
                  placeholder={t('import.defaultClientPh')}
                  value={defaultClient}
                  onChange={(e) => setDefaultClient(e.target.value)}
                  className="bg-card"
                />
              </div>
              <div className="space-y-2 sm:col-span-1">
                <Label>{t('import.defaultClientSelect')}</Label>
                <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                  <SelectTrigger className="bg-card">
                    <SelectValue placeholder={t('import.defaultClientSelectPh')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('import.defaultClientSelectNone')}</SelectItem>
                    {(clientsQuery.data ?? []).map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-1">
                <Label htmlFor="def-tjm">{t('import.defaultTjm')}</Label>
                <Input
                  id="def-tjm"
                  inputMode="decimal"
                  placeholder="650"
                  value={defaultTjm}
                  onChange={(e) => setDefaultTjm(e.target.value)}
                  className="bg-card"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 rounded-xl border border-dashed border-border/80 bg-muted/10 p-4 text-sm">
              <StatPill label={t('import.statCalendarDays')} value={stats.calendarDays} />
              <StatPill
                label={t('import.statBillable')}
                value={stats.billableWorkdays}
                accent="text-emerald-600 dark:text-emerald-400"
              />
              <StatPill label={t('import.statWeekend')} value={stats.weekendDays} />
              <StatPill label={t('import.statHolidayWeek')} value={stats.weekdayHolidays} />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-muted-foreground">
                <CalendarRange className="h-4 w-4" />
                {t('import.holidaysTitle')}
              </Label>
              {stats.holidaysInMonth.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('import.holidaysEmpty')}</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {stats.holidaysInMonth.map((h) => (
                    <li key={h.date}>
                      <Badge variant="secondary" className="font-normal tabular-nums">
                        <span className="text-muted-foreground">{formatDateShort(h.date, dfLocale)}</span>
                        <span className="mx-1.5 text-border">·</span>
                        {h.label}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Button type="button" size="lg" className="w-full sm:w-auto" disabled={busy} onClick={() => void onSubmit()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('import.manualCreateBtn')}
            </Button>
          </CardContent>
        </Card>

        <Card className="h-fit border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">{t('import.previewCalendarTitle')}</CardTitle>
            <CardDescription className="capitalize">{monthLabel}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'].map((d) => (
                <div key={d}>{t(`import.weekdayShort.${d}`)}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendar.map((cell, i) => {
                if (cell.type === 'empty') {
                  return <div key={`e-${i}`} className="aspect-square min-h-[2.25rem]" />
                }
                const kind = getDayRowKind(cell.iso)
                const hol = getFrenchMetropolitanHolidayLabel(cell.iso)
                return (
                  <div
                    key={cell.iso}
                    title={hol ?? undefined}
                    className={cn(
                      'flex aspect-square min-h-[2.25rem] flex-col items-center justify-center rounded-lg border text-xs font-medium tabular-nums transition-colors',
                      kind === 'holiday' &&
                        'border-amber-500/40 bg-amber-500/15 text-amber-950 dark:text-amber-50',
                      kind === 'weekend' && 'border-transparent bg-muted/50 text-muted-foreground',
                      kind === 'workday' &&
                        'border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-50',
                    )}
                  >
                    {cell.dayNum}
                  </div>
                )
              })}
            </div>
            <div className="flex flex-wrap gap-3 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/50" />
                {t('import.legendWork')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/30" />
                {t('import.legendWeekend')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-amber-500/50" />
                {t('import.legendHoliday')}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatPill({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent?: string
}) {
  return (
    <div className="min-w-[7.5rem] flex-1 rounded-lg border border-border/60 bg-card/80 px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('text-lg font-semibold tabular-nums tracking-tight', accent)}>{value}</div>
    </div>
  )
}

function formatDateShort(iso: string, locale: typeof fr) {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return format(new Date(y, m - 1, d), 'd MMM', { locale })
}
