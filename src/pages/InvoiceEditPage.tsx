import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Hash, Loader2, Plus, Trash2 } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

import { InvoiceEditorMobileToggle } from '@/components/invoices/InvoiceEditorMobileToggle'
import { InvoicePdfLivePreviewPanel } from '@/components/invoices/InvoicePdfLivePreviewPanel'
import { buildLivePreviewInputEdit } from '@/components/invoices/invoicePdfLivePreviewModel'
import { InvoiceTemplatePicker } from '@/components/invoices/InvoiceTemplatePicker'
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
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/useAuth'
import { useDebounced } from '@/hooks/useDebounced'
import { BILLING_UNITS } from '@/lib/invoiceCraAggregate'
import { fetchCompanyLogoBytes } from '@/lib/fetchCompanyLogo'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { buildInvoicePdf } from '@/services/pdf/invoicePdf'
import { INVOICE_PDF_TEMPLATE_IDS, type InvoicePdfTemplateId } from '@/services/pdf/invoice/types'
import { normalizeInvoicePdfPath, rebuildInvoicePdfPath } from '@/services/invoices/invoicePdfStorage'
import type { BillingUnit, Client, Invoice, InvoiceItem, InvoiceStatus, Profile, Settings } from '@/types/models'

const INVOICE_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF'] as const
const INVOICE_STATUSES: InvoiceStatus[] = ['pending', 'paid', 'archived']

function createEditInvoiceFormSchema(t: (k: string) => string) {
  const lineSchema = z.object({
    id: z.string().optional(),
    description: z.string().trim().min(1, t('invoices.invoiceForm.errDescription')),
    quantity: z.number().refine((n) => Number.isFinite(n) && n > 0, t('invoices.invoiceForm.errQuantity')),
    unitPrice: z.number().refine((n) => Number.isFinite(n) && n >= 0, t('invoices.invoiceForm.errPrice')),
    billingUnit: z.enum(['day', 'month', 'hour', 'flat']),
    timesheet_entry_id: z.string().nullable().optional(),
  })

  return z
    .object({
      clientId: z.string().min(1, t('invoices.invoiceForm.errClient')),
      status: z.enum(['pending', 'paid', 'archived']),
      issueDate: z.string().min(1, t('invoices.detail.errIssueDate')),
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

type FormValues = z.infer<ReturnType<typeof createEditInvoiceFormSchema>>

const emptyLine = (): FormValues['lines'][number] => ({
  description: '',
  quantity: 1,
  unitPrice: 0,
  billingUnit: 'day',
  timesheet_entry_id: null,
})

function isUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === '23505') return true
  const m = (err.message ?? '').toLowerCase()
  return m.includes('unique') || m.includes('duplicate')
}

/** Colonne renvoyée en snake_case par PostgREST ; tolère `clientId` si jamais transformé côté client. */
function readInvoiceClientId(inv: Invoice | Record<string, unknown>): string {
  const r = inv as Record<string, unknown>
  const v = r.client_id ?? r.clientId
  if (typeof v !== 'string') return ''
  return v.trim()
}

function normalizeInvoiceStatusForForm(status: unknown): FormValues['status'] {
  const raw = String(status ?? '').trim().toLowerCase()
  const normalized = raw === 'draft' || raw === 'sent' ? 'pending' : raw
  return (INVOICE_STATUSES as readonly string[]).includes(normalized as InvoiceStatus)
    ? (normalized as FormValues['status'])
    : 'pending'
}

export default function InvoiceEditPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const formSchema = useMemo(() => createEditInvoiceFormSchema(t), [t])
  /** Dernier snapshot de données hydraté dans le formulaire. */
  const lastHydratedSnapshotKey = useRef<string | null>(null)

  const [numberDialogOpen, setNumberDialogOpen] = useState(false)
  const [pendingNumber, setPendingNumber] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit')
  const formPanelId = useId()
  const previewPanelId = useId()

  const invoiceQuery = useQuery({
    queryKey: ['invoice', id],
    enabled: Boolean(user?.id && id),
    queryFn: async (): Promise<Invoice | null> => {
      const { data, error } = await supabase.from('invoices').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return (data as Invoice) ?? null
    },
  })

  const itemsQuery = useQuery({
    queryKey: ['invoice-items', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<InvoiceItem[]> => {
      const { data, error } = await supabase.from('invoice_items').select('*').eq('invoice_id', id!).order('created_at')
      if (error) throw error
      return (data ?? []) as InvoiceItem[]
    },
  })

  const clients = useQuery({
    queryKey: ['clients', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<Client[]> => {
      const { data, error } = await supabase.from('clients').select('*').order('name')
      if (error) throw error
      return (data ?? []) as Client[]
    },
  })

  const clientIdOnInvoice = invoiceQuery.data ? readInvoiceClientId(invoiceQuery.data) : ''
  const needsOrphanClientFetch = Boolean(
    invoiceQuery.data && clients.isSuccess && clientIdOnInvoice && !clients.data?.some((c) => c.id === clientIdOnInvoice),
  )

  const orphanClient = useQuery({
    queryKey: ['client', clientIdOnInvoice],
    enabled: Boolean(user?.id && needsOrphanClientFetch),
    queryFn: async (): Promise<Client | null> => {
      const { data, error } = await supabase.from('clients').select('*').eq('id', clientIdOnInvoice).maybeSingle()
      if (error) throw error
      return (data as Client) ?? null
    },
  })

  const clientSelectOptions = useMemo((): Client[] => {
    const base = [...(clients.data ?? [])]
    if (!clientIdOnInvoice) return base
    if (base.some((c) => c.id === clientIdOnInvoice)) return base
    if (orphanClient.data) return [...base, orphanClient.data]
    return [
      ...base,
      {
        id: clientIdOnInvoice,
        user_id: user?.id ?? '',
        created_at: '',
        updated_at: '',
        name: `${clientIdOnInvoice.slice(0, 8)}…`,
        email: null,
        address: null,
        vat_number: null,
        billing_notes: null,
      },
    ]
  }, [clients.data, clientIdOnInvoice, orphanClient.data, user?.id])

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
    queryFn: async (): Promise<Settings> => {
      const { data, error } = await supabase.from('settings').select('*').eq('user_id', user!.id).single()
      if (error) throw error
      return data as Settings
    },
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      status: 'pending',
      issueDate: new Date().toISOString().slice(0, 10),
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

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'lines' })
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

  useLayoutEffect(() => {
    lastHydratedSnapshotKey.current = null
  }, [id])

  /**
   * `reset` doit s’exécuter après l’enregistrement des champs par les `Controller` (effet post-commit).
   * Un `reset` dans `useLayoutEffect` peut partir avant les `useController` / Radix Select, ce qui laisse
   * les listes déroulantes sans valeur affichée.
   */
  useEffect(() => {
    const inv = invoiceQuery.data
    if (!inv || !id || !itemsQuery.isSuccess || !clients.isSuccess) return
    const snapshotKey = `${id}:${invoiceQuery.dataUpdatedAt}:${itemsQuery.dataUpdatedAt}`
    if (lastHydratedSnapshotKey.current === snapshotKey) return

    const items = itemsQuery.data ?? []
    const status = normalizeInvoiceStatusForForm(inv.status)
    const clientId = readInvoiceClientId(inv)
    const vatRaw = inv.vat_rate
    const vatRate = typeof vatRaw === 'number' && Number.isFinite(vatRaw) ? vatRaw : Number(vatRaw) || 0

    form.reset({
      clientId,
      status,
      issueDate: inv.issue_date,
      vatRate,
      notes: inv.notes ?? '',
      dueDate: inv.due_date ?? '',
      currency: (INVOICE_CURRENCIES as readonly string[]).includes(inv.currency) ? (inv.currency as FormValues['currency']) : 'EUR',
      pdfLocale: inv.pdf_locale === 'en' ? 'en' : 'fr',
      pdfTemplate: (INVOICE_PDF_TEMPLATE_IDS as readonly string[]).includes(String(inv.pdf_template))
        ? (inv.pdf_template as FormValues['pdfTemplate'])
        : 'corporate',
      lines:
        items.length > 0
          ? items.map((it) => ({
              id: it.id,
              description: it.description,
              quantity: it.quantity,
              unitPrice: it.unit_price,
              billingUnit: (['day', 'month', 'hour', 'flat'] as const).includes(it.billing_unit)
                ? it.billing_unit
                : 'day',
              timesheet_entry_id: it.timesheet_entry_id,
            }))
          : [emptyLine()],
    })
    lastHydratedSnapshotKey.current = snapshotKey
  }, [
    id,
    invoiceQuery.data,
    invoiceQuery.dataUpdatedAt,
    itemsQuery.isSuccess,
    itemsQuery.data,
    itemsQuery.dataUpdatedAt,
    clients.isSuccess,
    clients.data,
    form,
  ])

  /**
   * Garde-fou: sur certains timings (cache + refresh), le Select client peut rester vide
   * malgré un `client_id` valide sur la facture. On recale la valeur du form depuis la facture
   * uniquement si le champ est vide ou pointe vers un client absent des options.
   */
  useEffect(() => {
    if (!clientIdOnInvoice) return
    const current = form.getValues('clientId')
    const currentExistsInOptions = Boolean(current && clientSelectOptions.some((c) => c.id === current))
    if (current && currentExistsInOptions) return
    form.setValue('clientId', clientIdOnInvoice, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    })
  }, [clientIdOnInvoice, clientSelectOptions, form])

  useEffect(() => {
    if (invoiceQuery.isSuccess && invoiceQuery.data === null) {
      toast.error(t('invoices.detail.notFound'))
      void navigate('/invoices', { replace: true })
    }
  }, [invoiceQuery.isSuccess, invoiceQuery.data, navigate, t])

  const saveInvoice = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!user?.id || !id) throw new Error('no user')
      const inv = invoiceQuery.data
      if (!inv) throw new Error('no invoice')

      const draftItems = values.lines.map((l) => {
        const total_ht = Math.round(l.quantity * l.unitPrice * 100) / 100
        return {
          description: l.description.trim(),
          quantity: l.quantity,
          unit_price: l.unitPrice,
          total_ht,
          billing_unit: l.billingUnit as BillingUnit,
          timesheet_entry_id: l.timesheet_entry_id ?? null,
        }
      })
      const subtotal_ht = draftItems.reduce((a, i) => a + i.total_ht, 0)
      const vat_amount = (subtotal_ht * values.vatRate) / 100
      const total_ttc = subtotal_ht + vat_amount

      const { error: upErr } = await supabase
        .from('invoices')
        .update({
          client_id: values.clientId,
          issue_date: values.issueDate,
          due_date: values.dueDate || null,
          currency: values.currency,
          pdf_locale: values.pdfLocale,
          pdf_template: values.pdfTemplate,
          vat_rate: values.vatRate,
          notes: values.notes || null,
          status: values.status,
          subtotal_ht,
          vat_amount,
          total_ttc,
        })
        .eq('id', id)
      if (upErr) throw upErr

      const { error: delErr } = await supabase.from('invoice_items').delete().eq('invoice_id', id)
      if (delErr) throw delErr

      const { error: insErr } = await supabase.from('invoice_items').insert(
        draftItems.map((i) => ({
          invoice_id: id,
          description: i.description,
          quantity: i.quantity,
          unit_price: i.unit_price,
          total_ht: i.total_ht,
          billing_unit: i.billing_unit,
          timesheet_entry_id: i.timesheet_entry_id,
        })),
      )
      if (insErr) throw insErr

      const { data: savedItems, error: loadErr } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', id)
        .order('created_at')
      if (loadErr || !savedItems?.length) throw loadErr ?? new Error('items')

      const client = clientSelectOptions.find((c) => c.id === values.clientId)
      if (!client || !profile.data || !settings.data) throw new Error('context')

      const updatedInvoice: Invoice = {
        ...inv,
        client_id: values.clientId,
        issue_date: values.issueDate,
        due_date: values.dueDate || null,
        currency: values.currency,
        pdf_locale: values.pdfLocale,
        pdf_template: values.pdfTemplate,
        vat_rate: values.vatRate,
        notes: values.notes || null,
        status: values.status,
        subtotal_ht,
        vat_amount,
        total_ttc,
      }

      const logoBytes = await fetchCompanyLogoBytes(supabase, user.id, profile.data.logo_path)
      const pdfBytes = await buildInvoicePdf({
        profile: profile.data,
        client,
        invoice: updatedInvoice,
        items: savedItems as InvoiceItem[],
        settings: settings.data,
        logoBytes,
      })
      const path = `${user.id}/${id}.pdf`
      const { error: upPdfErr } = await supabase.storage.from('invoices-pdf').upload(path, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      })
      if (upPdfErr) throw upPdfErr

      const { error: pathErr } = await supabase.from('invoices').update({ pdf_path: path }).eq('id', id)
      if (pathErr) throw pathErr
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['invoice', id] })
      await qc.invalidateQueries({ queryKey: ['invoice-items', id] })
      await qc.invalidateQueries({ queryKey: ['invoices-all', user?.id] })
      await qc.invalidateQueries({ queryKey: ['dashboard-stats', user?.id] })
      toast.success(t('invoices.detail.saved'))
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(msg || t('invoices.detail.saveError'))
    },
  })

  const applyInvoiceNumber = useMutation({
    mutationFn: async (next: string) => {
      if (!user?.id || !id) throw new Error('no user')
      const trimmed = next.trim()
      if (!trimmed) throw new Error('empty')

      const { data: updated, error } = await supabase
        .from('invoices')
        .update({ invoice_number: trimmed })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error

      const rebuilt = await rebuildInvoicePdfPath(updated as Invoice, user.id, t)
      if (!rebuilt) throw new Error('pdf')
      return updated as Invoice
    },
    onSuccess: async () => {
      setNumberDialogOpen(false)
      await qc.invalidateQueries({ queryKey: ['invoice', id] })
      await qc.invalidateQueries({ queryKey: ['invoices-all', user?.id] })
      toast.success(t('invoices.detail.numberUpdated'))
    },
    onError: (e) => {
      const err = e as { code?: string; message?: string }
      if (isUniqueViolation(err)) {
        toast.error(t('invoices.detail.duplicateNumber'))
        return
      }
      toast.error(e instanceof Error ? e.message : t('invoices.detail.numberError'))
    },
  })

  const deleteInvoice = useMutation({
    mutationFn: async () => {
      if (!user?.id || !id) throw new Error('no user')
      const inv = invoiceQuery.data
      const p = normalizeInvoicePdfPath(inv?.pdf_path ?? null)
      if (p) {
        await supabase.storage.from('invoices-pdf').remove([p])
      }
      const { error } = await supabase.from('invoices').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: async () => {
      setDeleteDialogOpen(false)
      await qc.invalidateQueries({ queryKey: ['invoices-all', user?.id] })
      await qc.invalidateQueries({ queryKey: ['dashboard-stats', user?.id] })
      toast.success(t('invoices.detail.deleted'))
      void navigate('/invoices', { replace: true })
    },
    onError: () => toast.error(t('invoices.detail.deleteError')),
  })

  const livePreviewInput = useMemo(() => {
    const row = invoiceQuery.data
    if (!user?.id || !id || !row || !profile.data || !settings.data || !debouncedForm) return null
    return buildLivePreviewInputEdit(
      debouncedForm as FormValues,
      row,
      id,
      clientSelectOptions,
      profile.data,
      settings.data,
    )
  }, [user?.id, id, invoiceQuery.data, profile.data, settings.data, clientSelectOptions, debouncedForm])

  const busy = form.formState.isSubmitting || saveInvoice.isPending

  const openNumberDialog = () => {
    const row = invoiceQuery.data
    if (row) setPendingNumber(row.invoice_number)
    setNumberDialogOpen(true)
  }

  if (invoiceQuery.isSuccess && invoiceQuery.data === null) {
    return null
  }

  const waitingForData =
    invoiceQuery.isPending ||
    !invoiceQuery.data ||
    itemsQuery.isPending ||
    !itemsQuery.isSuccess ||
    clients.isPending ||
    !clients.isSuccess

  if (waitingForData) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <div className="mx-auto flex h-full w-full max-w-3xl flex-col justify-center space-y-4 px-1">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    )
  }

  const inv = invoiceQuery.data as Invoice

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1600px] flex-col overflow-hidden">
      <header className="shrink-0 border-b border-border/70 bg-background/95 pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 px-2 text-muted-foreground hover:text-foreground">
              <Link to="/invoices">
                <ArrowLeft className="mr-1 h-4 w-4" />
                {t('invoices.detail.back')}
              </Link>
            </Button>
            <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{inv.invoice_number}</h1>
            <p className="text-sm text-muted-foreground">{t('invoices.detail.subtitle')}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 sm:pt-7">
            <Button type="button" variant="outline" size="sm" onClick={openNumberDialog}>
              <Hash className="h-4 w-4" />
              {t('invoices.detail.changeNumber')}
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
              {t('invoices.detail.delete')}
            </Button>
          </div>
        </div>
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
            <form
              className="space-y-6 pb-[max(1rem,env(safe-area-inset-bottom))] lg:space-y-7 lg:pb-6"
              onSubmit={form.handleSubmit((v) => void saveInvoice.mutateAsync(v))}
            >
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">{t('invoices.detail.metaSection')}</CardTitle>
            <CardDescription>{t('invoices.detail.metaHint')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>{t('invoices.invoiceForm.client')}</Label>
              <Controller
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={busy}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {clientSelectOptions.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('invoices.detail.status')}</Label>
              <Controller
                control={form.control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={busy}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INVOICE_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {t(`invoices.status.${s}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="issueDate">{t('invoices.detail.issueDate')}</Label>
              <Input id="issueDate" type="date" disabled={busy} {...form.register('issueDate')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueEdit">{t('invoices.invoiceForm.due')}</Label>
              <Input id="dueEdit" type="date" disabled={busy} {...form.register('dueDate')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vatEdit">{t('invoices.invoiceForm.vat')}</Label>
              <Input id="vatEdit" type="number" step="0.1" disabled={busy} {...form.register('vatRate', { valueAsNumber: true })} />
            </div>
            <div className="space-y-2">
              <Label>{t('invoices.invoiceForm.currency')}</Label>
              <Controller
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={busy}>
                    <SelectTrigger>
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
            <div className="space-y-2 sm:col-span-2">
              <Label>{t('invoices.invoiceForm.pdfLocale')}</Label>
              <Controller
                control={form.control}
                name="pdfLocale"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={busy}>
                    <SelectTrigger className="max-w-xs">
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
            <div className="space-y-2 sm:col-span-2">
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
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="notesEdit">{t('invoices.invoiceForm.notes')}</Label>
              <Textarea id="notesEdit" rows={3} disabled={busy} {...form.register('notes')} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">{t('invoices.invoiceForm.linesSection')}</CardTitle>
            <CardDescription>{t('invoices.detail.linesHint')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id} className="rounded-lg border border-border/60 bg-muted/20 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase text-muted-foreground">
                    {t('invoices.invoiceForm.lineLabel', { n: index + 1 })}
                  </span>
                  {fields.length > 1 ? (
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(index)} disabled={busy}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-12">
                  <div className="sm:col-span-12">
                    <Label className="text-xs">{t('invoices.invoiceForm.description')}</Label>
                    <Textarea rows={2} className="mt-1" disabled={busy} {...form.register(`lines.${index}.description`)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:col-span-5">
                    <div>
                      <Label className="text-xs">{t('invoices.invoiceForm.quantity')}</Label>
                      <Input
                        type="number"
                        step="0.01"
                        className="mt-1"
                        disabled={busy}
                        {...form.register(`lines.${index}.quantity`, { valueAsNumber: true })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{t('invoices.invoiceForm.unit')}</Label>
                      <Controller
                        control={form.control}
                        name={`lines.${index}.billingUnit`}
                        render={({ field: f }) => (
                          <Select value={f.value} onValueChange={f.onChange} disabled={busy}>
                            <SelectTrigger className="mt-1">
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
                      className="mt-1"
                      disabled={busy}
                      {...form.register(`lines.${index}.unitPrice`, { valueAsNumber: true })}
                    />
                  </div>
                  <div className="flex flex-col justify-end sm:col-span-3">
                    <Label className="text-xs">{t('invoices.invoiceForm.lineTotal')}</Label>
                    <p className="mt-1 rounded-md border border-border px-2 py-1.5 text-right text-sm font-medium tabular-nums">
                      {new Intl.NumberFormat(numLocale, { style: 'currency', currency: watchedCurrency }).format(
                        (Number(watchedLines?.[index]?.quantity) || 0) * (Number(watchedLines?.[index]?.unitPrice) || 0),
                      )}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" className="w-full border-dashed" onClick={() => append(emptyLine())} disabled={busy}>
              <Plus className="h-4 w-4" />
              {t('invoices.invoiceForm.addLine')}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-gradient-to-b from-primary/[0.06] to-transparent shadow-sm">
          <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between gap-8">
                <span className="text-muted-foreground">{t('invoices.invoiceForm.subtotal')}</span>
                <span className="tabular-nums">{new Intl.NumberFormat(numLocale, { style: 'currency', currency: watchedCurrency }).format(subtotalHt)}</span>
              </div>
              <div className="flex justify-between gap-8">
                <span className="text-muted-foreground">{t('invoices.invoiceForm.vatPreview', { rate: watchedVat })}</span>
                <span className="tabular-nums">{new Intl.NumberFormat(numLocale, { style: 'currency', currency: watchedCurrency }).format(vatAmount)}</span>
              </div>
              <Separator />
              <div className="flex justify-between gap-8 text-base font-semibold">
                <span>{t('invoices.invoiceForm.totalTtc')}</span>
                <span className="tabular-nums">{new Intl.NumberFormat(numLocale, { style: 'currency', currency: watchedCurrency }).format(totalTtc)}</span>
              </div>
            </div>
            <Button type="submit" size="lg" disabled={busy || saveInvoice.isPending} className="w-full shrink-0 gap-2 sm:w-auto sm:min-w-[10rem]">
              {saveInvoice.isPending ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : null}
              {t('invoices.detail.save')}
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
              downloadBaseName={inv.invoice_number}
            />
          </aside>
        </div>
      </div>

      <Dialog open={numberDialogOpen} onOpenChange={setNumberDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('invoices.detail.numberDialogTitle')}</DialogTitle>
            <DialogDescription>{t('invoices.detail.numberDialogDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="newInvNum">{t('invoices.detail.newNumberLabel')}</Label>
            <Input id="newInvNum" value={pendingNumber} onChange={(e) => setPendingNumber(e.target.value)} autoComplete="off" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNumberDialogOpen(false)}>
              {t('invoices.detail.cancel')}
            </Button>
            <Button
              type="button"
              disabled={applyInvoiceNumber.isPending || !pendingNumber.trim()}
              onClick={() => void applyInvoiceNumber.mutateAsync(pendingNumber)}
            >
              {applyInvoiceNumber.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('invoices.detail.confirmNumber')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('invoices.detail.deleteDialogTitle')}</DialogTitle>
            <DialogDescription>{t('invoices.detail.deleteDialogDesc', { number: inv.invoice_number })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              {t('invoices.detail.cancel')}
            </Button>
            <Button type="button" variant="destructive" disabled={deleteInvoice.isPending} onClick={() => void deleteInvoice.mutateAsync()}>
              {deleteInvoice.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('invoices.detail.confirmDelete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
