import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Download, Loader2, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'
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
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase/client'
import type { Client } from '@/types/models'

const formSchema = z.object({
  name: z.string().trim().min(1),
  email: z
    .string()
    .optional()
    .transform((s) => (s ?? '').trim())
    .pipe(z.union([z.literal(''), z.string().email()])),
  address: z.string().optional(),
  vat_number: z.string().optional(),
  billing_notes: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

function emptyForm(): FormValues {
  return { name: '', email: '', address: '', vat_number: '', billing_notes: '' }
}

function clientToForm(c: Client): FormValues {
  return {
    name: c.name,
    email: c.email ?? '',
    address: c.address ?? '',
    vat_number: c.vat_number ?? '',
    billing_notes: c.billing_notes ?? '',
  }
}

export default function ClientsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null)

  const clientsQ = useQuery({
    queryKey: ['clients', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<Client[]> => {
      const { data, error } = await supabase.from('clients').select('*').order('name')
      if (error) throw error
      return (data ?? []) as Client[]
    },
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: emptyForm(),
  })

  const openCreate = useCallback(() => {
    setEditing(null)
    form.reset(emptyForm())
    setEditorOpen(true)
  }, [form])

  const openEdit = useCallback(
    (c: Client) => {
      setEditing(c)
      form.reset(clientToForm(c))
      setEditorOpen(true)
    },
    [form],
  )

  const upsert = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!user?.id) throw new Error('Session')
      const row = {
        name: values.name.trim(),
        email: values.email || null,
        address: values.address?.trim() || null,
        vat_number: values.vat_number?.trim() || null,
        billing_notes: values.billing_notes?.trim() || null,
      }
      if (editing) {
        const { error } = await supabase.from('clients').update(row).eq('id', editing.id)
        if (error) throw error
        return
      }
      const { error } = await supabase.from('clients').insert({ ...row, user_id: user.id })
      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['clients', user?.id] })
      toast.success(editing ? t('clients.saved') : t('clients.created'))
      setEditorOpen(false)
      setEditing(null)
    },
    onError: () => toast.error(t('clients.saveError')),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clients').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['clients', user?.id] })
      toast.success(t('clients.deleted'))
      setDeleteTarget(null)
    },
    onError: (e: unknown) => {
      const err = e as { code?: string; message?: string }
      const msg = (err.message ?? '').toLowerCase()
      if (err.code === '23503' || msg.includes('foreign key') || msg.includes('violates')) {
        toast.error(t('clients.deleteBlocked'))
      } else {
        toast.error(t('clients.deleteError'))
      }
    },
  })

  const busy = upsert.isPending
  const list = clientsQ.data ?? []

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{t('clients.title')}</h1>
          <p className="max-w-xl text-muted-foreground">{t('clients.subtitle')}</p>
        </div>
        <Button
          type="button"
          size="lg"
          className="shrink-0 shadow-sm"
          onClick={openCreate}
        >
          <Plus className="h-4 w-4" />
          {t('clients.add')}
        </Button>
      </div>

      <Card className="overflow-hidden border-border/80 border-l-4 border-l-amber-500/70 bg-gradient-to-br from-amber-500/[0.04] to-transparent">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <Download className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <CardTitle className="text-base">{t('clients.samplesTitle')}</CardTitle>
          </div>
          <CardDescription>{t('clients.samplesDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild className="border-amber-500/30 bg-background/80">
            <a href="/examples/clients-fictifs.csv" download>
              {t('clients.sampleClients')}
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild className="border-amber-500/30 bg-background/80">
            <a href="/examples/feuille-cra-exemple.csv" download>
              {t('clients.sampleSheet')}
            </a>
          </Button>
        </CardContent>
      </Card>

      {clientsQ.isLoading ? (
        <p className="text-sm text-muted-foreground">{t('clients.loading')}</p>
      ) : list.length === 0 ? (
        <Card className="max-w-2xl border-amber-500/35 bg-amber-500/[0.06] shadow-sm">
          <CardHeader className="space-y-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/25 bg-background/60">
              <Users className="h-7 w-7 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <CardTitle>{t('clients.emptyTitle')}</CardTitle>
              <CardDescription className="mt-2 text-base leading-relaxed">
                {t('clients.emptyDesc')}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button type="button" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              {t('clients.addFirst')}
            </Button>
            <Button variant="outline" asChild>
              <a href="/examples/clients-fictifs.csv" download>
                <Download className="h-4 w-4" />
                {t('clients.sampleClients')}
              </a>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((c) => (
            <li key={c.id}>
              <Card className="h-full border-border/80 transition-shadow hover:shadow-md">
                <CardContent className="flex gap-4 p-5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate font-semibold leading-tight">{c.name}</p>
                    {c.email ? (
                      <p className="truncate text-sm text-muted-foreground">{c.email}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground/70">{t('clients.noEmail')}</p>
                    )}
                    {c.vat_number ? (
                      <p className="truncate font-mono text-xs text-muted-foreground">{c.vat_number}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          onClick={() => openEdit(c)}
                          aria-label={t('clients.edit')}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left">{t('clients.edit')}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setDeleteTarget(c)}
                          aria-label={t('clients.delete')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left">{t('clients.delete')}</TooltipContent>
                    </Tooltip>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? t('clients.editTitle') : t('clients.createTitle')}</DialogTitle>
            <DialogDescription>{t('clients.formHint')}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((v) => void upsert.mutateAsync(v))}
          >
            <div className="space-y-2">
              <Label htmlFor="cl-name">{t('clients.fieldName')}</Label>
              <Input id="cl-name" autoComplete="organization" {...form.register('name')} />
              {form.formState.errors.name ? (
                <p className="text-xs text-destructive">{t('clients.nameRequired')}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cl-email">{t('clients.fieldEmail')}</Label>
              <Input id="cl-email" type="email" autoComplete="email" {...form.register('email')} />
              {form.formState.errors.email ? (
                <p className="text-xs text-destructive">{t('clients.emailInvalid')}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cl-addr">{t('clients.fieldAddress')}</Label>
              <Textarea id="cl-addr" rows={3} {...form.register('address')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cl-vat">{t('clients.fieldVat')}</Label>
              <Input id="cl-vat" {...form.register('vat_number')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cl-notes">{t('clients.fieldNotes')}</Label>
              <Textarea id="cl-notes" rows={2} {...form.register('billing_notes')} />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>
                {t('clients.cancel')}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {editing ? t('clients.save') : t('clients.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('clients.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('clients.deleteDesc', { name: deleteTarget?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('clients.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => deleteTarget && void remove.mutateAsync(deleteTarget.id)}
            >
              {remove.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('clients.confirmDelete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
