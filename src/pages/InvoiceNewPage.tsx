import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

import { InvoiceEditorMobileToggle } from '@/components/invoices/InvoiceEditorMobileToggle'
import { InvoicePdfLivePreviewPanel } from '@/components/invoices/InvoicePdfLivePreviewPanel'
import { buildLivePreviewInputNew } from '@/components/invoices/invoicePdfLivePreviewModel'
import { InvoiceTemplatePicker } from '@/components/invoices/InvoiceTemplatePicker'
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
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/useAuth'
import { useDebounced } from '@/hooks/useDebounced'
import {
  aggregateTimesheetDays,
  aggregateTimesheetMoney,
  BILLING_UNITS,
  suggestLineFromCra,
} from '@/lib/invoiceCraAggregate'
import { fetchCompanyLogoBytes } from '@/lib/fetchCompanyLogo'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { formatInvoiceNumberFromSettings } from '@/lib/invoiceNumber'
import { buildInvoicePdf } from '@/services/pdf/invoicePdf'
import { INVOICE_PDF_TEMPLATE_IDS, type InvoicePdfTemplateId } from '@/services/pdf/invoice/types'
import type { Client, Invoice, InvoiceItem, Profile, Settings, Timesheet, TimesheetEntry } from '@/types/models'

const INVOICE_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF'] as const

function createInvoiceFormSchema(t: (k: string) => string) {
  const lineSchema = z.object({
    description: z.string().trim().min(1, t('invoices.invoiceForm.errDescription')),
    quantity: z.number().refine((n) => Number.isFinite(n) && n > 0, t('invoices.invoiceForm.errQuantity')),
    unitPrice: z.number().refine((n) => Number.isFinite(n) && n >= 0, t('invoices.invoiceForm.errPrice')),
    billingUnit: z.enum(['day', 'month', 'hour', 'flat']),
  })

  return z
    .object({
      clientId: z.string().min(1, t('invoices.invoiceForm.errClient')),
      vatRate: z.number().min(0).max(100),
      notes: z.string().optional(),
      dueDate: z.string().optional(),
      currency: z.enum(INVOICE_CURRENCIES),
      pdfLocale: z.enum(['fr', 'en']),
      pdfTemplate: z.enum(INVOICE_PDF_TEMPLATE_IDS as unknown as [InvoicePdfTemplateId, ...InvoicePdfTemplateId[]]),
      lines: z.array(lineSchema).min(1),
    })
    .superRefine((data, ctx) => {
      const sum = data.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
      if (sum < 0.01) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('invoices.invoiceForm.errLinesTotal'),
          path: ['lines'],
        })
      }
    })
}

type FormValues = z.infer<ReturnType<typeof createInvoiceFormSchema>>

const emptyLine = (): FormValues['lines'][number] => ({
  description: '',
  quantity: 1,
  unitPrice: 0,
  billingUnit: 'day',
})

export default function InvoiceNewPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const timesheetId = params.get('timesheetId')
  const qc = useQueryClient()
  const craImportDone = useRef(false)
  const pdfDefaultsSynced = useRef(false)
  const formSchema = useMemo(() => createInvoiceFormSchema(t), [t])
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit')
  const formPanelId = useId()
  const previewPanelId = useId()

  const clients = useQuery({
    queryKey: ['clients', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<Client[]> => {
      const { data, error } = await supabase.from('clients').select('*').order('name')
      if (error) throw error
      return (data ?? []) as Client[]
    },
  })

  const timesheet = useQuery({
    queryKey: ['timesheet', timesheetId],
    enabled: Boolean(timesheetId && user?.id),
    queryFn: async (): Promise<Timesheet> => {
      const { data, error } = await supabase.from('timesheets').select('*').eq('id', timesheetId!).single()
      if (error) throw error
      return data as Timesheet
    },
  })

  const profile = useQuery({
    queryKey: ['profile', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
      if (error) throw error
      return data as Profile
    },
  })

  const settings = useQuery({
    queryKey: ['settings', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('*').eq('user_id', user!.id).single()
      if (error) throw error
      return data
    },
  })

  const entries = useQuery({
    queryKey: ['timesheet-entries', timesheetId],
    enabled: Boolean(timesheetId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('timesheet_entries')
        .select('*')
        .eq('timesheet_id', timesheetId!)
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as TimesheetEntry[]
    },
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      vatRate: 20,
      notes: '',
      dueDate: '',
      clientId: '',
      currency: 'EUR',
      pdfLocale: 'fr',
      pdfTemplate: 'corporate',
      lines: [emptyLine()],
    },
  })

  const { fields, append, remove, replace } = useFieldArray({ control: form.control, name: 'lines' })

  const watchedForm = useWatch({ control: form.control })
  const debouncedForm = useDebounced(watchedForm, 420)
  const watchedLines = useWatch({ control: form.control, name: 'lines' })
  const watchedVat = useWatch({ control: form.control, name: 'vatRate' }) ?? 20
  const watchedCurrency = useWatch({ control: form.control, name: 'currency' }) ?? 'EUR'
  const watchedPdfLocale = useWatch({ control: form.control, name: 'pdfLocale' }) ?? 'fr'
  const numLocale = watchedPdfLocale === 'en' ? 'en-US' : 'fr-FR'

  const subtotalHt = (watchedLines ?? []).reduce((s, l) => s + (Number(l?.quantity) || 0) * (Number(l?.unitPrice) || 0), 0)
  const vatAmount = (subtotalHt * (Number(watchedVat) || 0)) / 100
  const totalTtc = subtotalHt + vatAmount

  useEffect(() => {
    const first = clients.data?.[0]?.id
    if (first && !form.getValues('clientId')) {
      form.setValue('clientId', first)
    }
  }, [clients.data, form])

  useEffect(() => {
    if (!settings.data || pdfDefaultsSynced.current) return
    pdfDefaultsSynced.current = true
    const loc = String(settings.data.locale ?? '').toLowerCase().startsWith('en') ? 'en' : 'fr'
    form.setValue('pdfLocale', loc)
    const tpl = String(settings.data.invoice_template ?? 'corporate')
    if ((INVOICE_PDF_TEMPLATE_IDS as readonly string[]).includes(tpl)) {
      form.setValue('pdfTemplate', tpl as FormValues['pdfTemplate'])
    }
  }, [settings.data, form])

  useEffect(() => {
    if (craImportDone.current) return
    if (!timesheetId || !timesheet.data || !entries.data?.length) return
    const line = suggestLineFromCra(entries.data, {
      timesheetTitle: timesheet.data.title,
      monthYear: timesheet.data.month_year,
    })
    replace([line])
    craImportDone.current = true
  }, [timesheetId, timesheet.data, entries.data, replace])

  const importFromCra = useCallback(() => {
    if (!entries.data?.length || !timesheet.data) {
      toast.error(t('invoices.invoiceForm.craEmpty'))
      return
    }
    const line = suggestLineFromCra(entries.data, {
      timesheetTitle: timesheet.data.title,
      monthYear: timesheet.data.month_year,
    })
    replace([line])
    toast.success(t('invoices.invoiceForm.craImported'))
  }, [entries.data, timesheet.data, replace, t])

  const livePreviewInput = useMemo(() => {
    if (!user || !profile.data || !settings.data || !debouncedForm) return null
    const nextNumber = formatInvoiceNumberFromSettings(settings.data as Settings)
    return buildLivePreviewInputNew(
      debouncedForm as FormValues,
      clients.data ?? [],
      profile.data,
      settings.data as Settings,
      user.id,
      nextNumber,
    )
  }, [user, profile.data, settings.data, clients.data, debouncedForm])

  const busy = form.formState.isSubmitting

  const onSubmit = form.handleSubmit(async (values) => {
    if (!user || !profile.data || !settings.data) {
      toast.error('Profil ou réglages introuvables')
      return
    }
    const client = clients.data?.find((c) => c.id === values.clientId)
    if (!client) {
      toast.error('Client invalide')
      return
    }

    const seq = Math.max(1, Math.floor(Number(settings.data.next_invoice_sequence) || 1))
    const invoiceNumber = formatInvoiceNumberFromSettings(settings.data as Settings)

    const draftItems = values.lines.map((l) => {
      const total_ht = Math.round(l.quantity * l.unitPrice * 100) / 100
      return {
        description: l.description.trim(),
        quantity: l.quantity,
        unit_price: l.unitPrice,
        total_ht,
        billing_unit: l.billingUnit,
        timesheet_entry_id: null as string | null,
      }
    })

    const subtotal_ht = draftItems.reduce((a, i) => a + i.total_ht, 0)
    const vat_amount = (subtotal_ht * values.vatRate) / 100
    const total_ttc = subtotal_ht + vat_amount

    const { data: inv, error: invErr } = await supabase
      .from('invoices')
      .insert({
        user_id: user.id,
        client_id: client.id,
        invoice_number: invoiceNumber,
        issue_date: new Date().toISOString().slice(0, 10),
        due_date: values.dueDate || null,
        currency: values.currency,
        pdf_locale: values.pdfLocale,
        pdf_template: values.pdfTemplate,
        vat_rate: values.vatRate,
        notes: values.notes || null,
        status: 'pending',
        subtotal_ht,
        vat_amount,
        total_ttc,
      })
      .select()
      .single()
    if (invErr) {
      toast.error(invErr.message)
      return
    }

    const { error: itErr } = await supabase.from('invoice_items').insert(
      draftItems.map((i) => ({
        invoice_id: inv.id,
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unit_price,
        total_ht: i.total_ht,
        billing_unit: i.billing_unit,
        timesheet_entry_id: i.timesheet_entry_id,
      })),
    )
    if (itErr) {
      toast.error(itErr.message)
      return
    }

    await supabase.from('settings').update({ next_invoice_sequence: seq + 1 }).eq('user_id', user.id)

    const { data: savedItems, error: loadErr } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', inv.id)
      .order('created_at')
    if (loadErr || !savedItems) {
      toast.error(loadErr?.message ?? 'Erreur chargement lignes')
      return
    }

    const invoiceRow = inv as Invoice

    const logoBytes = await fetchCompanyLogoBytes(supabase, user.id, profile.data.logo_path)
    const pdfBytes = await buildInvoicePdf({
      profile: profile.data,
      client,
      invoice: invoiceRow,
      items: savedItems as InvoiceItem[],
      settings: settings.data as Settings,
      logoBytes,
    })

    const path = `${user.id}/${inv.id}.pdf`
    const { error: upErr } = await supabase.storage.from('invoices-pdf').upload(path, pdfBytes, {
      contentType: 'application/pdf',
      upsert: true,
    })
    if (upErr) {
      toast.error(upErr.message)
      return
    }

    await supabase.from('invoices').update({ pdf_path: path }).eq('id', inv.id)

    toast.success('Facture créée')
    await qc.invalidateQueries({ queryKey: ['invoices'] })
    await qc.invalidateQueries({ queryKey: ['invoices-all'] })
    await qc.invalidateQueries({ queryKey: ['dashboard-stats', user.id] })
    void navigate('/invoices')
  })

  if (clients.isLoading || profile.isLoading || settings.isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col items-start justify-center overflow-hidden">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    )
  }

  if (!clients.data?.length) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain">
        <Card className="max-w-lg border-amber-500/40 bg-amber-500/5">
        <CardHeader>
          <CardTitle>{t('invoices.clientRequiredTitle')}</CardTitle>
          <CardDescription>{t('invoices.clientRequiredDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/clients">{t('invoices.goClients')}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/settings">{t('nav.settings')}</Link>
          </Button>
        </CardContent>
      </Card>
      </div>
    )
  }

  const craDays = entries.data?.length ? aggregateTimesheetDays(entries.data) : 0
  const craHt = entries.data?.length ? aggregateTimesheetMoney(entries.data) : 0

  const previewFileName = settings.data ? formatInvoiceNumberFromSettings(settings.data as Settings) : 'facture'

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1600px] flex-col overflow-hidden">
      <header className="shrink-0 border-b border-border/70 bg-background/95 pb-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 h-8 px-2 text-muted-foreground hover:text-foreground">
          <Link to="/invoices">
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t('invoices.detail.back')}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('invoices.new')}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t('invoices.invoiceForm.subtitle')}</p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-3 lg:pt-0">
        <InvoiceEditorMobileToggle
          value={mobileTab}
          onChange={setMobileTab}
          formPanelId={formPanelId}
          previewPanelId={previewPanelId}
          className="mb-2 shrink-0 lg:hidden"
        />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-1 lg:grid lg:grid-cols-[minmax(0,1fr)_min(380px,34vw)] lg:grid-rows-[minmax(0,1fr)] lg:gap-8 lg:overflow-hidden lg:pt-6 xl:grid-cols-[minmax(0,1fr)_min(440px,38%)]">
          <div
            id={formPanelId}
            role="tabpanel"
            aria-labelledby={`${formPanelId}-tab`}
            className={cn(
              'min-h-0 min-w-0 lg:block lg:overflow-y-auto lg:overscroll-y-contain lg:pr-3',
              mobileTab === 'preview' && 'max-lg:hidden',
              mobileTab === 'edit' && 'max-lg:flex max-lg:flex-1 max-lg:flex-col max-lg:overflow-y-auto max-lg:overscroll-y-contain',
            )}
          >
            <form className="space-y-6 pb-[max(1rem,env(safe-area-inset-bottom))] lg:space-y-7 lg:pb-6" onSubmit={onSubmit}>
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t('invoices.invoiceForm.clientSection')}</CardTitle>
            <CardDescription>{t('invoices.invoiceForm.clientHint')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t('invoices.invoiceForm.client')}</Label>
              <Controller
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="h-11 bg-background">
                      <SelectValue placeholder={t('invoices.invoiceForm.clientPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.data.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {form.formState.errors.clientId ? (
                <p className="text-xs text-destructive">{form.formState.errors.clientId.message}</p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader className="flex flex-col gap-4 border-b border-border/60 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg">{t('invoices.invoiceForm.linesSection')}</CardTitle>
              <CardDescription>{t('invoices.invoiceForm.linesHint')}</CardDescription>
            </div>
            {timesheetId && entries.data?.length ? (
              <div className="flex flex-col items-stretch gap-2 sm:items-end">
                <p className="text-right text-xs text-muted-foreground">
                  {t('invoices.invoiceForm.craSummary', {
                    days: craDays.toLocaleString(numLocale, { maximumFractionDigits: 2 }),
                    total: new Intl.NumberFormat(numLocale, { style: 'currency', currency: watchedCurrency }).format(craHt),
                  })}
                </p>
                <Button type="button" variant="secondary" className="shrink-0" onClick={importFromCra}>
                  {t('invoices.invoiceForm.craImport')}
                </Button>
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-3">
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="rounded-xl border border-border/80 bg-muted/20 p-4 shadow-sm transition-colors hover:bg-muted/30"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t('invoices.invoiceForm.lineLabel', { n: index + 1 })}
                    </span>
                    {fields.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => remove(index)}
                        aria-label={t('invoices.invoiceForm.removeLine')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-12">
                    <div className="sm:col-span-12">
                      <Label className="text-xs">{t('invoices.invoiceForm.description')}</Label>
                      <Textarea
                        rows={2}
                        className="mt-1.5 resize-none bg-background"
                        {...form.register(`lines.${index}.description`)}
                      />
                      {form.formState.errors.lines?.[index]?.description ? (
                        <p className="mt-1 text-xs text-destructive">
                          {form.formState.errors.lines[index]?.description?.message}
                        </p>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:col-span-5">
                      <div>
                        <Label className="text-xs">{t('invoices.invoiceForm.quantity')}</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          className="mt-1.5 h-10 bg-background"
                          {...form.register(`lines.${index}.quantity`, { valueAsNumber: true })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">{t('invoices.invoiceForm.unit')}</Label>
                        <Controller
                          control={form.control}
                          name={`lines.${index}.billingUnit`}
                          render={({ field: f }) => (
                            <Select value={f.value} onValueChange={f.onChange}>
                              <SelectTrigger className="mt-1.5 h-10 bg-background">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {BILLING_UNITS.map((u) => (
                                  <SelectItem key={u} value={u}>
                                    {t(`invoices.units.${u}`)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                    </div>
                    <div className="sm:col-span-4">
                      <Label className="text-xs">{t('invoices.invoiceForm.unitPrice')}</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        className="mt-1.5 h-10 bg-background"
                        {...form.register(`lines.${index}.unitPrice`, { valueAsNumber: true })}
                      />
                    </div>
                    <div className="flex flex-col justify-end sm:col-span-3">
                      <Label className="text-xs">{t('invoices.invoiceForm.lineTotal')}</Label>
                      <p className="mt-1.5 rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-right text-sm font-semibold tabular-nums">
                        {new Intl.NumberFormat(numLocale, { style: 'currency', currency: watchedCurrency }).format(
                          (Number(watchedLines?.[index]?.quantity) || 0) * (Number(watchedLines?.[index]?.unitPrice) || 0),
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {form.formState.errors.lines && typeof form.formState.errors.lines.message === 'string' ? (
              <p className="text-xs text-destructive">{form.formState.errors.lines.message}</p>
            ) : null}
            <Button type="button" variant="outline" className="w-full border-dashed" onClick={() => append(emptyLine())}>
              <Plus className="h-4 w-4" />
              {t('invoices.invoiceForm.addLine')}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">{t('invoices.invoiceForm.optionsSection')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="vat">{t('invoices.invoiceForm.vat')}</Label>
                  <Input id="vat" type="number" step="0.1" className="h-10 bg-background" {...form.register('vatRate', { valueAsNumber: true })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="due">{t('invoices.invoiceForm.due')}</Label>
                  <Input id="due" type="date" className="h-10 bg-background" {...form.register('dueDate')} />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('invoices.invoiceForm.pdfSection')}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t('invoices.invoiceForm.currency')}</Label>
                    <Controller
                      control={form.control}
                      name="currency"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger className="h-10 bg-background">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {INVOICE_CURRENCIES.map((c) => (
                              <SelectItem key={c} value={c}>
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('invoices.invoiceForm.pdfLocale')}</Label>
                    <Controller
                      control={form.control}
                      name="pdfLocale"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger className="h-10 bg-background">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fr">FR</SelectItem>
                            <SelectItem value="en">EN</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </div>
                <Controller
                  control={form.control}
                  name="pdfTemplate"
                  render={({ field }) => (
                    <InvoiceTemplatePicker
                      value={field.value}
                      onChange={field.onChange}
                      brandPrimary={profile.data?.brand_primary}
                      brandSecondary={profile.data?.brand_secondary}
                      disabled={busy}
                    />
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">{t('invoices.invoiceForm.notes')}</Label>
                <Textarea id="notes" rows={3} className="resize-none bg-background" {...form.register('notes')} />
              </div>
            </CardContent>
          </Card>

        <Card className="border-primary/20 bg-gradient-to-b from-primary/[0.06] to-transparent shadow-sm">
            <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-3 text-sm">
                <p className="text-base font-semibold">{t('invoices.invoiceForm.summary')}</p>
                <div className="flex justify-between gap-8">
                  <span className="text-muted-foreground">{t('invoices.invoiceForm.subtotal')}</span>
                  <span className="font-medium tabular-nums">
                    {new Intl.NumberFormat(numLocale, { style: 'currency', currency: watchedCurrency }).format(subtotalHt)}
                  </span>
                </div>
                <div className="flex justify-between gap-8">
                  <span className="text-muted-foreground">{t('invoices.invoiceForm.vatPreview', { rate: watchedVat })}</span>
                  <span className="tabular-nums">
                    {new Intl.NumberFormat(numLocale, { style: 'currency', currency: watchedCurrency }).format(vatAmount)}
                  </span>
                </div>
                <Separator className="bg-primary/15" />
                <div className="flex justify-between gap-8 text-base font-semibold">
                  <span>{t('invoices.invoiceForm.totalTtc')}</span>
                  <span className="tabular-nums text-primary">
                    {new Intl.NumberFormat(numLocale, { style: 'currency', currency: watchedCurrency }).format(totalTtc)}
                  </span>
                </div>
              </div>
              <Button type="submit" className="w-full shrink-0 gap-2 sm:w-auto sm:min-w-[12rem]" size="lg" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : null}
                {t('invoices.invoiceForm.generate')}
              </Button>
            </CardContent>
          </Card>
      </form>
          </div>

          <aside
            id={previewPanelId}
            role="tabpanel"
            aria-labelledby={`${previewPanelId}-tab`}
            className={cn(
              'flex min-h-0 w-full min-w-0 flex-col overflow-hidden lg:h-full',
              mobileTab === 'edit' && 'max-lg:hidden',
              mobileTab === 'preview' && 'max-lg:flex-1',
            )}
          >
            <InvoicePdfLivePreviewPanel
              className="min-h-0 flex-1 shadow-lg max-lg:rounded-b-none max-lg:border-x-0 max-lg:border-b-0 max-lg:shadow-none lg:rounded-xl"
              input={livePreviewInput}
              downloadBaseName={previewFileName}
            />
          </aside>
        </div>
      </div>
    </div>
  )
}
