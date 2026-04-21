import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addMonths, eachDayOfInterval, endOfMonth, format, getISODay, parseISO, startOfMonth, subMonths } from 'date-fns'
import { enUS, fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Download, Loader2, Trash2 } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useClients } from '@/hooks/useClients'
import { downloadTimesheetCsv } from '@/lib/csv'
import { getFrenchMetropolitanHolidayLabel } from '@/lib/frenchPublicHolidays'
import { getDayRowKind } from '@/lib/manualMonthRows'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { TimesheetEntry } from '@/types/models'

type Row = TimesheetEntry

const CLIENT_NONE = 'none'

/** Une journée CRA = 0, ½ ou 1 jour (saisie simplifiée). */
type WorkdayBand = 0 | 0.5 | 1

function snapToWorkdayBand(h: number): WorkdayBand {
  const x = Number(h) || 0
  if (x <= 0) return 0
  if (x < 1) return 0.5
  return 1
}

function nextWorkdayBand(h: WorkdayBand): WorkdayBand {
  if (h === 0) return 0.5
  if (h === 0.5) return 1
  return 0
}

function DayWorkCheckbox({ band, variant }: { band: WorkdayBand; variant: 'onGreen' | 'onGradient' | 'onMuted' }) {
  const ref = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.indeterminate = band === 0.5
    el.checked = band === 1
  }, [band])

  return (
    <input
      ref={ref}
      type="checkbox"
      readOnly
      tabIndex={-1}
      aria-hidden
      className={cn(
        'pointer-events-none size-[1.05rem] shrink-0 rounded border-2 transition-colors',
        variant === 'onGreen' &&
          'border-emerald-500/40 bg-white/90 accent-emerald-600 shadow-sm dark:border-emerald-400/35 dark:bg-emerald-950/40 dark:accent-emerald-400',
        variant === 'onGradient' &&
          'border-emerald-400/35 bg-white/75 accent-emerald-600 dark:border-emerald-500/30 dark:bg-white/15 dark:accent-emerald-400',
        variant === 'onMuted' && 'border-muted-foreground/45 bg-background/80 accent-muted-foreground',
      )}
    />
  )
}

function parseMonthYear(s: string | null | undefined): { y: number; m: number } | null {
  if (!s || !/^\d{4}-\d{2}$/.test(s)) return null
  const [y, m] = s.split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) return null
  return { y, m }
}

function inferViewMonth(monthYear: string | null | undefined, rows: Row[]): { y: number; m: number } {
  const fromTs = parseMonthYear(monthYear)
  if (fromTs) return fromTs
  const sorted = [...rows].map((r) => r.work_date).filter(Boolean).sort() as string[]
  if (sorted.length) {
    const d = parseISO(sorted[0])
    if (!Number.isNaN(+d)) return { y: d.getFullYear(), m: d.getMonth() + 1 }
  }
  const n = new Date()
  return { y: n.getFullYear(), m: n.getMonth() + 1 }
}

function daySortOrderInMonth(iso: string, vm: { y: number; m: number }): number {
  const d = parseISO(iso)
  if (Number.isNaN(+d)) return 0
  if (d.getFullYear() !== vm.y || d.getMonth() + 1 !== vm.m) return d.getDate()
  return d.getDate() - 1
}

export default function TimesheetEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [showOrphans, setShowOrphans] = useState(false)

  const [viewMonth, setViewMonth] = useState<{ y: number; m: number }>(() => ({
    y: new Date().getFullYear(),
    m: new Date().getMonth() + 1,
  }))
  const viewInitialized = useRef(false)
  const sheetMetaInit = useRef(false)

  const [rows, setRows] = useState<Row[]>([])
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const [sheetMission, setSheetMission] = useState('')
  const [sheetTjm, setSheetTjm] = useState('')
  const [clientSelectId, setClientSelectId] = useState<string>(CLIENT_NONE)
  const [clientFreeName, setClientFreeName] = useState('')
  const skipNextAutosave = useRef(true)
  const insertingDatesRef = useRef<Set<string>>(new Set())

  const timesheetQuery = useQuery({
    queryKey: ['timesheet', id],
    enabled: Boolean(id && user?.id),
    queryFn: async () => {
      const { data, error } = await supabase.from('timesheets').select('*').eq('id', id!).single()
      if (error) throw error
      return data
    },
  })

  const entriesQuery = useQuery({
    queryKey: ['timesheet-entries', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from('timesheet_entries')
        .select('*')
        .eq('timesheet_id', id!)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as Row[]
    },
  })

  const clientsQuery = useClients(user?.id)

  const resolvedClientId = clientSelectId === CLIENT_NONE ? null : clientSelectId
  const resolvedClientName = useMemo(() => {
    if (resolvedClientId) {
      const c = (clientsQuery.data ?? []).find((x) => x.id === resolvedClientId)
      return c?.name ?? ''
    }
    return clientFreeName.trim()
  }, [resolvedClientId, clientsQuery.data, clientFreeName])

  useEffect(() => {
    if (!entriesQuery.data) return
    queueMicrotask(() => {
      setRows(entriesQuery.data!)
      skipNextAutosave.current = true

      if (!sheetMetaInit.current && entriesQuery.data.length) {
        sheetMetaInit.current = true
        const sample = entriesQuery.data[0]
        setSheetMission(sample.project_name ?? '')
        setSheetTjm(sample.daily_rate != null && Number(sample.daily_rate) > 0 ? String(sample.daily_rate) : '')
        const withClient = entriesQuery.data.find((r) => r.client_id)
        if (withClient?.client_id) {
          setClientSelectId(withClient.client_id)
          setClientFreeName('')
        } else {
          setClientSelectId(CLIENT_NONE)
          setClientFreeName(entriesQuery.data.find((r) => r.client_name)?.client_name ?? '')
        }
      }
    })
  }, [entriesQuery.data])

  useEffect(() => {
    if (viewInitialized.current || !timesheetQuery.data || !entriesQuery.data) return
    viewInitialized.current = true
    setViewMonth(inferViewMonth(timesheetQuery.data.month_year, entriesQuery.data))
  }, [timesheetQuery.data, entriesQuery.data])

  const monthStart = useMemo(() => new Date(viewMonth.y, viewMonth.m - 1, 1), [viewMonth.y, viewMonth.m])
  const monthLabel = useMemo(() => {
    const loc = i18n.language?.startsWith('en') ? enUS : fr
    return format(monthStart, 'LLLL yyyy', { locale: loc })
  }, [monthStart, i18n.language])

  const calendarWeeks = useMemo(() => {
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
    const weeks: (typeof cells)[] = []
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
    return weeks
  }, [monthStart])

  const rowIndexByDate = useMemo(() => {
    const m = new Map<string, number>()
    rows.forEach((r, i) => {
      if (r.work_date && !m.has(r.work_date)) m.set(r.work_date, i)
    })
    return m
  }, [rows])

  const orphanRows = useMemo(() => rows.filter((r) => !r.work_date), [rows])

  const totals = useMemo(() => {
    let ht = 0
    for (const r of rows) {
      ht += (Number(r.hours) || 0) * (Number(r.daily_rate) || 0)
    }
    return { ht }
  }, [rows])

  useEffect(() => {
    if (!id || !timesheetQuery.data || !user?.id) return
    const ym = `${viewMonth.y}-${String(viewMonth.m).padStart(2, '0')}`
    if (timesheetQuery.data.month_year === ym) return
    const t = window.setTimeout(() => {
      void supabase
        .from('timesheets')
        .update({ month_year: ym })
        .eq('id', id)
        .then(() => {
          void qc.invalidateQueries({ queryKey: ['timesheet', id] })
          void qc.invalidateQueries({ queryKey: ['timesheets-with-entries', user.id] })
        })
    }, 400)
    return () => window.clearTimeout(t)
  }, [viewMonth.y, viewMonth.m, id, timesheetQuery.data, user?.id, qc])

  useEffect(() => {
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false
      return
    }
    if (!rows.length || !id) return
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const tjm = Number.parseFloat(String(sheetTjm).replace(',', '.'))
          const dailyRate = Number.isFinite(tjm) && tjm >= 0 ? tjm : 0
          const mission = sheetMission.trim()
          const cname = resolvedClientName
          const cid = resolvedClientId
          for (const row of rows) {
            const hoursDiscrete = snapToWorkdayBand(Number(row.hours) || 0)
            const { error } = await supabase
              .from('timesheet_entries')
              .update({
                work_date: row.work_date,
                project_name: mission || row.project_name,
                client_name: cname || row.client_name,
                client_id: cid,
                hours: hoursDiscrete,
                daily_rate: dailyRate || row.daily_rate,
                comment: row.comment,
                sort_order: row.sort_order,
              })
              .eq('id', row.id)
            if (error) throw error
          }
          await supabase.from('timesheets').update({ status: 'parsed' }).eq('id', id)
          await qc.invalidateQueries({ queryKey: ['timesheet-entries', id] })
          await qc.invalidateQueries({ queryKey: ['timesheets'] })
          if (user?.id) await qc.invalidateQueries({ queryKey: ['dashboard-stats', user.id] })
        } catch {
          toast.error(t('editor.autosaveError'))
        }
      })()
    }, 900)
    return () => window.clearTimeout(timer)
  }, [rows, id, qc, user?.id, sheetMission, sheetTjm, resolvedClientName, resolvedClientId, t])

  const insertDayRow = async (iso: string, hours: number) => {
    if (!id || !user) return
    if (insertingDatesRef.current.has(iso)) return
    insertingDatesRef.current.add(iso)
    try {
      const discrete = snapToWorkdayBand(hours)
      const tjm = Number.parseFloat(String(sheetTjm).replace(',', '.'))
      const dailyRate = Number.isFinite(tjm) && tjm >= 0 ? tjm : 0
      const mission = sheetMission.trim()
      const cname = resolvedClientName
      const cid = resolvedClientId
      const sort_order = daySortOrderInMonth(iso, viewMonth)
      const { data, error } = await supabase
        .from('timesheet_entries')
        .insert({
          timesheet_id: id,
          work_date: iso,
          project_name: mission || null,
          client_name: cname || '',
          client_id: cid,
          hours: discrete,
          daily_rate: dailyRate,
          comment: '',
          sort_order,
        })
        .select()
        .single()
      if (error) {
        toast.error(error.message)
        return
      }
      setRows((prev) => {
        if (prev.some((r) => r.work_date === iso)) return prev
        return [...prev, data as Row].sort(
          (a, b) => (a.work_date ?? '').localeCompare(b.work_date ?? '') || a.sort_order - b.sort_order,
        )
      })
    } finally {
      insertingDatesRef.current.delete(iso)
    }
  }

  const onCellHoursChange = (iso: string, raw: string) => {
    const hours = snapToWorkdayBand(Number(String(raw).replace(',', '.')) || 0)
    const tjm = Number.parseFloat(String(sheetTjm).replace(',', '.'))
    const dailyRate = Number.isFinite(tjm) && tjm >= 0 ? tjm : 0
    const mission = sheetMission.trim()
    const cname = resolvedClientName
    const cid = resolvedClientId

    setRows((prev) => {
      const idx = prev.findIndex((r) => r.work_date === iso)
      if (idx === -1) return prev
      return prev.map((x, i) =>
        i === idx
          ? {
              ...x,
              hours,
              project_name: mission || x.project_name,
              daily_rate: dailyRate || x.daily_rate,
              client_name: cname || x.client_name,
              client_id: cid,
            }
          : x,
      )
    })

    if (!rowsRef.current.some((r) => r.work_date === iso) && hours !== 0) void insertDayRow(iso, hours)
  }

  const cycleDayHours = (iso: string) => {
    const prev = rowsRef.current
    const idx = prev.findIndex((r) => r.work_date === iso)
    const current = snapToWorkdayBand(idx >= 0 ? prev[idx]!.hours : 0)
    const next = nextWorkdayBand(current)
    onCellHoursChange(iso, String(next))
  }

  const removeRow = async (rowId: string) => {
    setRows((r) => r.filter((x) => x.id !== rowId))
    const { error } = await supabase.from('timesheet_entries').delete().eq('id', rowId)
    if (error) toast.error(error.message)
  }

  const deleteTimesheet = useMutation({
    mutationFn: async () => {
      if (!user?.id || !id) throw new Error('missing context')
      const { data: rowsToDelete, error: rowsErr } = await supabase
        .from('timesheet_entries')
        .select('id')
        .eq('timesheet_id', id)
      if (rowsErr) throw rowsErr

      const rowIds = (rowsToDelete ?? []).map((r) => r.id)
      if (rowIds.length) {
        const { error: unlinkErr } = await supabase
          .from('invoice_items')
          .update({ timesheet_entry_id: null })
          .in('timesheet_entry_id', rowIds)
        if (unlinkErr) throw unlinkErr
      }

      const { error: entriesErr } = await supabase.from('timesheet_entries').delete().eq('timesheet_id', id)
      if (entriesErr) throw entriesErr

      const { error: timesheetErr } = await supabase.from('timesheets').delete().eq('id', id).eq('user_id', user.id)
      if (timesheetErr) throw timesheetErr
    },
    onSuccess: async () => {
      setDeleteDialogOpen(false)
      await qc.invalidateQueries({ queryKey: ['timesheets'] })
      await qc.invalidateQueries({ queryKey: ['timesheets-with-entries', user?.id] })
      await qc.invalidateQueries({ queryKey: ['dashboard-stats', user?.id] })
      toast.success(t('editor.deleted'))
      void navigate('/timesheets', { replace: true })
    },
    onError: () => {
      toast.error(t('editor.deleteError'))
    },
  })

  const goPrevMonth = () => {
    const d = subMonths(monthStart, 1)
    setViewMonth({ y: d.getFullYear(), m: d.getMonth() + 1 })
  }

  const goNextMonth = () => {
    const d = addMonths(monthStart, 1)
    setViewMonth({ y: d.getFullYear(), m: d.getMonth() + 1 })
  }

  if (timesheetQuery.isLoading || entriesQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('editor.title')}</h1>
          <p className="text-sm text-muted-foreground">{timesheetQuery.data?.title}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!rows.length}
            onClick={() => downloadTimesheetCsv(`cra-${id}.csv`, rows)}
          >
            <Download className="h-4 w-4" />
            CSV
          </Button>
          <Button asChild>
            <Link to={`/invoices/new?timesheetId=${id}`}>{t('editor.invoice')}</Link>
          </Button>
          <Button type="button" variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
            {t('editor.deleteTimesheet')}
          </Button>
        </div>
      </div>

      <Card className="border-border/80">
        <CardHeader className="space-y-1 pb-3">
          <CardTitle className="text-base">{t('editor.calendarTitle')}</CardTitle>
          <CardDescription>{t('editor.calendarSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2 sm:col-span-2">
              <Label className="text-xs">{t('editor.sheetClient')}</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={clientSelectId} onValueChange={setClientSelectId}>
                  <SelectTrigger className="sm:min-w-[12rem]">
                    <SelectValue placeholder={t('editor.sheetClientSelectPh')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CLIENT_NONE}>{t('editor.sheetClientNone')}</SelectItem>
                    {(clientsQuery.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {clientSelectId === CLIENT_NONE ? (
                  <Input
                    value={clientFreeName}
                    onChange={(e) => setClientFreeName(e.target.value)}
                    placeholder={t('editor.sheetClientFreePh')}
                    className="flex-1"
                  />
                ) : null}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sheet-mission" className="text-xs">
                {t('editor.sheetMission')}
              </Label>
              <Input
                id="sheet-mission"
                value={sheetMission}
                onChange={(e) => setSheetMission(e.target.value)}
                placeholder={t('editor.sheetMissionPh')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sheet-tjm" className="text-xs">
                {t('editor.sheetTjm')}
              </Label>
              <Input
                id="sheet-tjm"
                inputMode="decimal"
                value={sheetTjm}
                onChange={(e) => setSheetTjm(e.target.value)}
                placeholder="650"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-y border-border/60 py-3">
            <div className="flex items-center gap-1">
              <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={goPrevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[10rem] px-2 text-center text-sm font-semibold capitalize tabular-nums">
                {monthLabel}
              </span>
              <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={goNextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="secondary">{t('editor.autosave')}</Badge>
              <span className="font-medium tabular-nums text-muted-foreground">
                {t('editor.totalHt')}{' '}
                {new Intl.NumberFormat(i18n.language === 'en' ? 'en-US' : 'fr-FR', {
                  style: 'currency',
                  currency: 'EUR',
                }).format(totals.ht)}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <span className="h-3.5 w-7 rounded-sm bg-emerald-100 shadow-sm ring-1 ring-emerald-300/50 dark:bg-emerald-900/45 dark:ring-emerald-600/30" />
              {t('editor.legendFull')}
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3.5 w-7 rounded-sm bg-gradient-to-br from-emerald-200/90 via-emerald-50 to-white shadow-sm ring-1 ring-emerald-200/60 dark:from-emerald-800/50 dark:via-emerald-950/40 dark:to-zinc-900 dark:ring-emerald-700/25" />
              {t('editor.legendHalf')}
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3.5 w-7 rounded-sm bg-muted ring-1 ring-border" />
              {t('editor.legendOff')}
            </span>
            <span className="text-[10px] text-muted-foreground/90">{t('editor.legendClick')}</span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border/70 bg-muted/10 p-2">
            <div className="min-w-[36rem] space-y-1">
              <div className="grid grid-cols-7 gap-px text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {(['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'] as const).map((d) => (
                  <div key={d} className="py-1">
                    {t(`import.weekdayShort.${d}`)}
                  </div>
                ))}
              </div>
              {calendarWeeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-px">
                  {week.map((cell, ci) => {
                    if (cell.type === 'empty') {
                      return <div key={`e-${wi}-${ci}`} className="min-h-[3.25rem] rounded-md bg-transparent" />
                    }
                    const kind = getDayRowKind(cell.iso)
                    const hol = getFrenchMetropolitanHolidayLabel(cell.iso)
                    const idx = rowIndexByDate.get(cell.iso)
                    const hoursVal = idx !== undefined ? rows[idx]!.hours : 0
                    const workState = snapToWorkdayBand(Number(hoursVal) || 0)
                    const checkVariant =
                      workState === 1 ? 'onGreen' : workState === 0.5 ? 'onGradient' : 'onMuted'
                    const ariaState =
                      workState === 1 ? t('editor.dayAriaFull') : workState === 0.5 ? t('editor.dayAriaHalf') : t('editor.dayAriaOff')
                    return (
                      <button
                        key={cell.iso}
                        type="button"
                        title={hol ? `${hol} · ${ariaState}` : ariaState}
                        onClick={() => cycleDayHours(cell.iso)}
                        onKeyDown={(e) => {
                          if (e.key === ' ' || e.key === 'Enter') {
                            e.preventDefault()
                            cycleDayHours(cell.iso)
                          }
                        }}
                        aria-label={t('editor.dayCycleAria', { day: cell.dayNum, month: monthLabel, state: ariaState })}
                        className={cn(
                          'flex min-h-[3.75rem] flex-col items-center justify-between gap-0.5 rounded-md border p-1.5 text-left transition-[background,box-shadow,transform,border-color] duration-150 hover:brightness-[1.015] active:scale-[0.98]',
                          workState === 1 &&
                            'border-emerald-300/80 bg-emerald-50 text-emerald-950 shadow-sm ring-1 ring-emerald-200/50 dark:border-emerald-600/30 dark:bg-emerald-950/40 dark:text-emerald-50 dark:ring-emerald-700/20',
                          workState === 0.5 &&
                            'border-emerald-200/90 bg-gradient-to-br from-emerald-100/95 via-emerald-50/90 to-white text-emerald-950 shadow-sm ring-1 ring-emerald-100/80 dark:from-emerald-900/45 dark:via-emerald-950/35 dark:to-background dark:text-emerald-100 dark:ring-emerald-800/25',
                          workState === 0 && 'border-border/70 bg-muted/75 text-muted-foreground',
                          kind === 'holiday' && 'ring-2 ring-amber-400/50 ring-offset-1 ring-offset-background',
                          kind === 'weekend' && workState === 0 && 'opacity-[0.92]',
                        )}
                      >
                        <div className="flex w-full items-start justify-between gap-0.5">
                          <span
                            className={cn(
                              'text-[11px] font-semibold tabular-nums',
                              workState === 1 && 'text-emerald-900 dark:text-emerald-100',
                              workState === 0.5 && 'text-emerald-950 dark:text-emerald-50',
                            )}
                          >
                            {cell.dayNum}
                          </span>
                          {kind === 'holiday' ? (
                            <span
                              className={cn(
                                'max-w-[3.5rem] truncate text-[8px] font-medium leading-tight',
                                workState === 1 ? 'text-amber-800 dark:text-amber-200' : 'text-amber-900 dark:text-amber-200',
                              )}
                            >
                              {t('editor.badgeHoliday')}
                            </span>
                          ) : kind === 'weekend' ? (
                            <span
                              className={cn(
                                'text-[8px] font-medium',
                                workState === 1 ? 'text-emerald-800/85 dark:text-emerald-200/90' : 'text-muted-foreground',
                              )}
                            >
                              {t('editor.badgeWeekendShort')}
                            </span>
                          ) : (
                            <span className="w-4 shrink-0" aria-hidden />
                          )}
                        </div>
                        <DayWorkCheckbox band={workState} variant={checkVariant} />
                        <span
                          className={cn(
                            'w-full text-center text-[10px] font-semibold tabular-nums',
                            workState === 1 && 'text-emerald-900 dark:text-emerald-100',
                            workState === 0.5 && 'text-emerald-900 dark:text-emerald-100',
                          )}
                        >
                          {workState === 1 ? '1' : workState === 0.5 ? '½' : '0'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{t('editor.calendarHint')}</p>

          {orphanRows.length ? (
            <div className="rounded-lg border border-dashed border-border/80 bg-muted/15 px-3 py-2">
              <button
                type="button"
                className="flex w-full items-center justify-between text-left text-sm font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setShowOrphans((v) => !v)}
              >
                {t('editor.orphanToggle', { count: orphanRows.length })}
                <span className="text-xs">{showOrphans ? '−' : '+'}</span>
              </button>
              {showOrphans ? (
                <ul className="mt-2 space-y-2 border-t border-border/50 pt-2">
                  {orphanRows.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-muted-foreground">{t('editor.orphanLine')}</span>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => void removeRow(r.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('editor.deleteDialogTitle')}</DialogTitle>
            <DialogDescription>{t('editor.deleteDialogDesc', { title: timesheetQuery.data?.title ?? '' })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              {t('editor.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteTimesheet.isPending}
              onClick={() => void deleteTimesheet.mutateAsync()}
            >
              {deleteTimesheet.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('editor.confirmDelete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
