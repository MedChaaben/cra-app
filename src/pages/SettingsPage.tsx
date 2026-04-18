import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm, useWatch, type Resolver } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

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
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/useAuth'
import { formatInvoiceNumberFromSettings } from '@/lib/invoiceNumber'
import { supabase } from '@/lib/supabase/client'
import { INVOICE_PDF_TEMPLATE_IDS, type InvoicePdfTemplateId } from '@/services/pdf/invoice/types'
import type { Profile, Settings } from '@/types/models'

function createSettingsSchema(t: (k: string) => string) {
  return z.object({
    full_name: z.string().optional(),
    company_name: z.string().optional(),
    company_address: z.string().optional(),
    company_tax_id: z.string().optional(),
    company_email: z.string().optional(),
    company_phone: z.string().optional(),
    brand_primary: z.string().optional(),
    brand_secondary: z.string().optional(),
    iban: z.string().optional(),
    bic: z.string().optional(),
    vat_zero_note: z.string().optional(),
    invoice_prefix: z.string().trim().min(1, t('settings.invoicePrefixRequired')),
    next_invoice_sequence: z.number().int().min(1).max(999_999),
    invoice_template: z.enum(INVOICE_PDF_TEMPLATE_IDS as unknown as [InvoicePdfTemplateId, ...InvoicePdfTemplateId[]]),
    invoice_payment_terms: z.string().optional(),
    invoice_late_penalty: z.string().optional(),
    invoice_sepa_qr: z.boolean(),
  })
}

type FormValues = z.infer<ReturnType<typeof createSettingsSchema>>

export default function SettingsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const qc = useQueryClient()
  const schema = useMemo(() => createSettingsSchema(t), [t])
  const [resetSeqOpen, setResetSeqOpen] = useState(false)

  const profile = useQuery({
    queryKey: ['profile', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
      if (error) throw error
      return data as Profile
    },
  })

  const settings = useQuery({
    queryKey: ['settings', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<Settings | null> => {
      const { data, error } = await supabase.from('settings').select('*').eq('user_id', user!.id).single()
      if (error) throw error
      return data as Settings
    },
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: {
      invoice_prefix: 'FAC',
      next_invoice_sequence: 1,
      invoice_template: 'corporate',
      invoice_sepa_qr: true,
      invoice_payment_terms: '',
      invoice_late_penalty: '',
    },
  })

  const watchedPrefix = useWatch({ control: form.control, name: 'invoice_prefix' }) ?? 'FAC'
  const watchedSeq = useWatch({ control: form.control, name: 'next_invoice_sequence' }) ?? 1
  const numberPreview = formatInvoiceNumberFromSettings({
    invoice_prefix: watchedPrefix,
    next_invoice_sequence: watchedSeq,
  } as Pick<Settings, 'invoice_prefix' | 'next_invoice_sequence'>)

  useEffect(() => {
    if (!profile.data || !settings.data) return
    form.reset({
      full_name: profile.data.full_name ?? '',
      company_name: profile.data.company_name ?? '',
      company_address: profile.data.company_address ?? '',
      company_tax_id: profile.data.company_tax_id ?? '',
      company_email: profile.data.company_email ?? '',
      company_phone: profile.data.company_phone ?? '',
      brand_primary: profile.data.brand_primary ?? '',
      brand_secondary: profile.data.brand_secondary ?? '',
      iban: profile.data.iban ?? '',
      bic: profile.data.bic ?? '',
      vat_zero_note: profile.data.vat_zero_note ?? '',
      invoice_prefix: settings.data.invoice_prefix ?? 'FAC',
      next_invoice_sequence: Math.max(1, Math.floor(Number(settings.data.next_invoice_sequence) || 1)),
      invoice_template: (INVOICE_PDF_TEMPLATE_IDS as readonly string[]).includes(String(settings.data.invoice_template))
        ? (settings.data.invoice_template as FormValues['invoice_template'])
        : 'corporate',
      invoice_payment_terms: settings.data.invoice_payment_terms ?? '',
      invoice_late_penalty: settings.data.invoice_late_penalty ?? '',
      invoice_sepa_qr: settings.data.invoice_sepa_qr !== false,
    })
  }, [profile.data, settings.data, form])

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const { error: pErr } = await supabase
        .from('profiles')
        .update({
          full_name: values.full_name || null,
          company_name: values.company_name || null,
          company_address: values.company_address || null,
          company_tax_id: values.company_tax_id || null,
          company_email: values.company_email || null,
          company_phone: values.company_phone || null,
          brand_primary: values.brand_primary?.trim() || null,
          brand_secondary: values.brand_secondary?.trim() || null,
          iban: values.iban || null,
          bic: values.bic?.trim() || null,
          vat_zero_note: values.vat_zero_note?.trim() || null,
        })
        .eq('id', user!.id)
      if (pErr) throw pErr

      const { error: sErr } = await supabase
        .from('settings')
        .update({
          invoice_prefix: values.invoice_prefix.trim(),
          next_invoice_sequence: values.next_invoice_sequence,
          invoice_template: values.invoice_template,
          invoice_payment_terms: values.invoice_payment_terms?.trim() || null,
          invoice_late_penalty: values.invoice_late_penalty?.trim() || null,
          invoice_sepa_qr: values.invoice_sepa_qr,
        })
        .eq('user_id', user!.id)
      if (sErr) throw sErr
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['profile', user?.id] })
      await qc.invalidateQueries({ queryKey: ['settings', user?.id] })
      toast.success(t('settings.savedToast'))
    },
    onError: () => toast.error(t('settings.saveError')),
  })

  if (profile.isLoading || settings.isLoading) {
    return <p className="text-sm text-muted-foreground">{t('settings.loading')}</p>
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t('settings.title')}</h1>
        <p className="text-muted-foreground">{t('settings.subtitle')}</p>
      </div>

      <form className="space-y-8" onSubmit={form.handleSubmit((v) => void save.mutateAsync(v))}>
        <Card className="border-border/80">
          <CardHeader>
            <CardTitle>{t('settings.profile')}</CardTitle>
            <CardDescription>{t('settings.profileDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">{t('settings.fieldDisplayName')}</Label>
              <Input id="full_name" {...form.register('full_name')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company_name">{t('settings.fieldCompanyName')}</Label>
              <Input id="company_name" {...form.register('company_name')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company_address">{t('settings.fieldAddress')}</Label>
              <Textarea id="company_address" rows={3} {...form.register('company_address')} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="company_tax_id">{t('settings.fieldTaxId')}</Label>
                <Input id="company_tax_id" {...form.register('company_tax_id')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company_email">{t('settings.fieldCompanyEmail')}</Label>
                <Input id="company_email" type="email" {...form.register('company_email')} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="company_phone">{t('settings.fieldCompanyPhone')}</Label>
              <Input id="company_phone" {...form.register('company_phone')} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="brand_primary">{t('settings.fieldBrandPrimary')}</Label>
                <Input id="brand_primary" placeholder="#0f2741" {...form.register('brand_primary')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brand_secondary">{t('settings.fieldBrandSecondary')}</Label>
                <Input id="brand_secondary" placeholder="#2563eb" {...form.register('brand_secondary')} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="iban">{t('settings.fieldIban')}</Label>
                <Input id="iban" {...form.register('iban')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bic">{t('settings.fieldBic')}</Label>
                <Input id="bic" {...form.register('bic')} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vat_zero_note">{t('settings.fieldVatZeroNote')}</Label>
              <Textarea id="vat_zero_note" rows={2} {...form.register('vat_zero_note')} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80">
          <CardHeader>
            <CardTitle>{t('settings.invoiceNumberTitle')}</CardTitle>
            <CardDescription>{t('settings.invoiceNumberDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="invoice_prefix">{t('settings.fieldInvoicePrefix')}</Label>
                <Input id="invoice_prefix" {...form.register('invoice_prefix')} autoComplete="off" />
                {form.formState.errors.invoice_prefix ? (
                  <p className="text-xs text-destructive">{form.formState.errors.invoice_prefix.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="next_invoice_sequence">{t('settings.fieldNextInvoiceSequence')}</Label>
                <Input id="next_invoice_sequence" type="number" min={1} {...form.register('next_invoice_sequence', { valueAsNumber: true })} />
                {form.formState.errors.next_invoice_sequence ? (
                  <p className="text-xs text-destructive">{form.formState.errors.next_invoice_sequence.message}</p>
                ) : null}
              </div>
            </div>
            <p className="rounded-md border border-border/80 bg-muted/30 px-3 py-2 text-sm">
              <span className="text-muted-foreground">{t('settings.invoiceNumberPreview')}</span>{' '}
              <span className="font-mono font-medium">{numberPreview}</span>
            </p>
            <p className="text-xs text-muted-foreground">{t('settings.invoiceNumberPatternHint')}</p>
            <Button type="button" variant="outline" onClick={() => setResetSeqOpen(true)}>
              {t('settings.resetSequenceCta')}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/80">
          <CardHeader>
            <CardTitle>{t('settings.invoicePdfTitle')}</CardTitle>
            <CardDescription>{t('settings.invoicePdfDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t('settings.fieldInvoiceTemplate')}</Label>
              <Select
                value={form.watch('invoice_template')}
                onValueChange={(v) => form.setValue('invoice_template', v as FormValues['invoice_template'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVOICE_PDF_TEMPLATE_IDS.map((id) => (
                    <SelectItem key={id} value={id}>
                      {t(`settings.template.${id}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice_payment_terms">{t('settings.fieldPaymentTerms')}</Label>
              <Textarea id="invoice_payment_terms" rows={3} {...form.register('invoice_payment_terms')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice_late_penalty">{t('settings.fieldLatePenalty')}</Label>
              <Textarea id="invoice_late_penalty" rows={3} {...form.register('invoice_late_penalty')} />
            </div>
            <div className="flex items-center gap-3">
              <input
                id="invoice_sepa_qr"
                type="checkbox"
                className="h-4 w-4 rounded border border-input"
                checked={form.watch('invoice_sepa_qr')}
                onChange={(e) => form.setValue('invoice_sepa_qr', e.target.checked)}
              />
              <Label htmlFor="invoice_sepa_qr" className="cursor-pointer font-normal">
                {t('settings.fieldSepaQr')}
              </Label>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t('settings.save')}
        </Button>
      </form>

      <Dialog open={resetSeqOpen} onOpenChange={setResetSeqOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.resetSequenceTitle')}</DialogTitle>
            <DialogDescription>{t('settings.resetSequenceDesc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setResetSeqOpen(false)}>
              {t('settings.resetSequenceCancel')}
            </Button>
            <Button
              type="button"
              onClick={() => {
                form.setValue('next_invoice_sequence', 1, { shouldDirty: true })
                setResetSeqOpen(false)
                toast.success(t('settings.resetSequenceApplied'))
              }}
            >
              {t('settings.resetSequenceConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
