import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

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
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase/client'
import { buildInvoicePdf } from '@/services/pdf/invoicePdf'
import type { Client, Invoice, InvoiceItem, Profile, TimesheetEntry } from '@/types/models'

const schema = z.object({
  clientId: z.string().min(1, 'Sélectionnez un client'),
  vatRate: z.number().min(0).max(100),
  notes: z.string().optional(),
  dueDate: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export default function InvoiceNewPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const timesheetId = params.get('timesheetId')
  const qc = useQueryClient()

  const clients = useQuery({
    queryKey: ['clients', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<Client[]> => {
      const { data, error } = await supabase.from('clients').select('*').order('name')
      if (error) throw error
      return (data ?? []) as Client[]
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
    queryFn: async (): Promise<TimesheetEntry[]> => {
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
    resolver: zodResolver(schema),
    defaultValues: { vatRate: 20, notes: '', dueDate: '', clientId: '' },
  })

  useEffect(() => {
    const first = clients.data?.[0]?.id
    if (first && !form.getValues('clientId')) {
      form.setValue('clientId', first)
    }
  }, [clients.data, form])

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

    const prefix = settings.data.invoice_prefix as string
    const seq = settings.data.next_invoice_sequence as number
    const invoiceNumber = `${prefix}-${String(seq).padStart(4, '0')}`

    const sourceEntries = entries.data ?? []
    const draftItems = sourceEntries.map((e) => {
      const qty = Number(e.hours) || 0
      const unit = Number(e.daily_rate) || 0
      const total_ht = qty * unit
      const desc = [e.work_date, e.project_name, e.client_name].filter(Boolean).join(' · ') || 'Prestation'
      return {
        description: desc,
        quantity: qty,
        unit_price: unit,
        total_ht,
        timesheet_entry_id: e.id,
      }
    })

    if (!draftItems.length) {
      toast.error('Aucune ligne à facturer — importez une feuille ou ajoutez des lignes.')
      return
    }

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
        currency: 'EUR',
        vat_rate: values.vatRate,
        notes: values.notes || null,
        status: 'draft',
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
        timesheet_entry_id: i.timesheet_entry_id,
      }))
    )
    if (itErr) {
      toast.error(itErr.message)
      return
    }

    await supabase
      .from('settings')
      .update({ next_invoice_sequence: seq + 1 })
      .eq('user_id', user.id)

    const { data: savedItems, error: loadErr } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', inv.id)
    if (loadErr || !savedItems) {
      toast.error(loadErr?.message ?? 'Erreur chargement lignes')
      return
    }

    const invoiceRow = inv as Invoice

    const pdfBytes = await buildInvoicePdf({
      profile: profile.data,
      client,
      invoice: invoiceRow,
      items: savedItems as InvoiceItem[],
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
    void navigate('/invoices')
  })

  if (clients.isLoading || profile.isLoading || settings.isLoading) {
    return <p className="text-sm text-muted-foreground">Chargement…</p>
  }

  if (!clients.data?.length) {
    return (
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
    )
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t('invoices.new')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          PDF A4 professionnel, TVA configurable, numérotation automatique.
        </p>
      </div>

      <Card className="border-border/80">
        <CardContent className="pt-6">
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label>Client</Label>
              <Controller
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir un client" />
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
            <div className="space-y-2">
              <Label htmlFor="vat">TVA (%)</Label>
              <Input id="vat" type="number" step="0.1" {...form.register('vatRate', { valueAsNumber: true })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="due">Échéance (optionnel)</Label>
              <Input id="due" type="date" {...form.register('dueDate')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={3} {...form.register('notes')} />
            </div>
            <p className="text-xs text-muted-foreground">
              Lignes : {entries.data?.length ?? 0} depuis la feuille liée.
              {!timesheetId ? ' Ouvrez cette page depuis l’éditeur de feuille pour préremplir les lignes.' : null}
            </p>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Générer la facture PDF
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
