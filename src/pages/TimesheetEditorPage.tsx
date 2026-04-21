import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Loader2, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'
import { downloadTimesheetCsv } from '@/lib/csv'
import { getFrenchMetropolitanHolidayLabel } from '@/lib/frenchPublicHolidays'
import { getDayRowKind } from '@/lib/manualMonthRows'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { TimesheetEntry } from '@/types/models'

type Row = TimesheetEntry

export default function TimesheetEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

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

  const [rows, setRows] = useState<Row[]>([])
  const skipNextAutosave = useRef(true)

  useEffect(() => {
    if (!entriesQuery.data) return
    queueMicrotask(() => {
      setRows(entriesQuery.data!)
      skipNextAutosave.current = true
    })
  }, [entriesQuery.data])

  const totals = useMemo(() => {
    let ht = 0
    for (const r of rows) {
      ht += (Number(r.hours) || 0) * (Number(r.daily_rate) || 0)
    }
    return { ht }
  }, [rows])

  useEffect(() => {
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false
      return
    }
    if (!rows.length || !id) return
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          for (const row of rows) {
            const { error } = await supabase
              .from('timesheet_entries')
              .update({
                work_date: row.work_date,
                project_name: row.project_name,
                client_name: row.client_name,
                hours: row.hours,
                daily_rate: row.daily_rate,
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
          toast.error('Autosave impossible')
        }
      })()
    }, 900)
    return () => window.clearTimeout(t)
  }, [rows, id, qc, user?.id])

  const updateRow = (index: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const addRow = () => {
    if (!id) return
    void (async () => {
      const { data, error } = await supabase
        .from('timesheet_entries')
        .insert({
          timesheet_id: id,
          work_date: null,
          project_name: '',
          client_name: '',
          hours: 0,
          daily_rate: 0,
          comment: '',
          sort_order: rows.length,
        })
        .select()
        .single()
      if (error) {
        toast.error(error.message)
        return
      }
      setRows((r) => [...r, data as Row])
    })()
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

  if (timesheetQuery.isLoading || entriesQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('editor.title')}</h1>
          <p className="text-sm text-muted-foreground">{timesheetQuery.data?.title}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void addRow()}>
            <Plus className="h-4 w-4" />
            {t('editor.addRow')}
          </Button>
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
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Lignes</CardTitle>
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="secondary">Autosave</Badge>
            <span className="font-medium tabular-nums">
              Total HT :{' '}
              {new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(totals.ht)}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="w-full">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                  <th className="pb-2 pr-2 font-medium">Date</th>
                  <th className="pb-2 pr-2 font-medium">Mission</th>
                  <th className="pb-2 pr-2 font-medium">Client</th>
                  <th className="pb-2 pr-2 font-medium">{t('editor.colDays')}</th>
                  <th className="pb-2 pr-2 font-medium">TJM</th>
                  <th className="pb-2 pr-2 font-medium">Conf.</th>
                  <th className="pb-2 pr-2 font-medium">Commentaire</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody className="align-middle">
                {rows.map((row, i) => {
                  const kind = row.work_date ? getDayRowKind(row.work_date) : null
                  const holidayLabel = row.work_date ? getFrenchMetropolitanHolidayLabel(row.work_date) : null
                  return (
                  <tr
                    key={row.id}
                    className={cn(
                      'border-b border-border/60',
                      kind === 'holiday' && 'bg-amber-500/[0.07]',
                      kind === 'weekend' && 'bg-muted/35',
                    )}
                  >
                    <td className="py-2 pr-2">
                      <div className="flex min-w-[9rem] flex-col gap-1">
                        <Input
                          type="date"
                          value={row.work_date ?? ''}
                          onChange={(e) => updateRow(i, { work_date: e.target.value || null })}
                          className="h-9 w-full min-w-0"
                        />
                        {kind === 'holiday' ? (
                          <Badge variant="outline" className="w-fit border-amber-500/40 text-[10px] font-normal">
                            {t('editor.badgeHoliday')}
                            {holidayLabel ? ` · ${holidayLabel}` : ''}
                          </Badge>
                        ) : kind === 'weekend' ? (
                          <Badge variant="secondary" className="w-fit text-[10px] font-normal">
                            {t('editor.badgeWeekend')}
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        value={row.project_name ?? ''}
                        onChange={(e) => updateRow(i, { project_name: e.target.value })}
                        className="h-9 min-w-[8rem]"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        value={row.client_name ?? ''}
                        onChange={(e) => updateRow(i, { client_name: e.target.value })}
                        className="h-9 min-w-[8rem]"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        type="number"
                        step="0.25"
                        value={row.hours}
                        onChange={(e) => updateRow(i, { hours: Number(e.target.value) })}
                        className="h-9 w-24"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        type="number"
                        step="10"
                        value={row.daily_rate}
                        onChange={(e) => updateRow(i, { daily_rate: Number(e.target.value) })}
                        className="h-9 w-28"
                      />
                    </td>
                    <td className="py-2 pr-2 text-xs text-muted-foreground">
                      {row.ocr_confidence != null ? `${row.ocr_confidence.toFixed(0)}%` : '—'}
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        value={row.comment ?? ''}
                        onChange={(e) => updateRow(i, { comment: e.target.value })}
                        className="h-9 min-w-[10rem]"
                      />
                    </td>
                    <td className="py-2">
                      <Button type="button" variant="ghost" size="icon" onClick={() => void removeRow(row.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </ScrollArea>
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
            <Button type="button" variant="destructive" disabled={deleteTimesheet.isPending} onClick={() => void deleteTimesheet.mutateAsync()}>
              {deleteTimesheet.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('editor.confirmDelete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
