import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Sparkles } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase/client'
import { seedDemoDataForUser } from '@/services/demoSeed'
import type { Profile } from '@/types/models'

const schema = z.object({
  full_name: z.string().optional(),
  company_name: z.string().optional(),
  company_address: z.string().optional(),
  company_tax_id: z.string().optional(),
  iban: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export default function SettingsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const qc = useQueryClient()

  const profile = useQuery({
    queryKey: ['profile', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
      if (error) throw error
      return data as Profile
    },
  })

  const form = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (!profile.data) return
    form.reset({
      full_name: profile.data.full_name ?? '',
      company_name: profile.data.company_name ?? '',
      company_address: profile.data.company_address ?? '',
      company_tax_id: profile.data.company_tax_id ?? '',
      iban: profile.data.iban ?? '',
    })
  }, [profile.data, form])

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: values.full_name || null,
          company_name: values.company_name || null,
          company_address: values.company_address || null,
          company_tax_id: values.company_tax_id || null,
          iban: values.iban || null,
        })
        .eq('id', user!.id)
      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['profile', user?.id] })
      toast.success('Profil enregistré')
    },
    onError: () => toast.error('Impossible d’enregistrer'),
  })

  const demo = useMutation({
    mutationFn: async () => {
      if (!user?.id) return
      await seedDemoDataForUser(user.id)
    },
    onSuccess: async () => {
      await qc.invalidateQueries()
      toast.success('Données démo chargées')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (profile.isLoading) {
    return <p className="text-sm text-muted-foreground">Chargement…</p>
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t('settings.title')}</h1>
        <p className="text-muted-foreground">Informations affichées sur vos factures PDF.</p>
      </div>

      <Card className="border-border/80">
        <CardHeader>
          <CardTitle>{t('settings.profile')}</CardTitle>
          <CardDescription>Société, coordonnées bancaires et mentions légales.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((v) => void save.mutateAsync(v))}
          >
            <div className="space-y-2">
              <Label htmlFor="full_name">Nom affiché</Label>
              <Input id="full_name" {...form.register('full_name')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company_name">Raison sociale</Label>
              <Input id="company_name" {...form.register('company_name')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company_address">Adresse</Label>
              <Textarea id="company_address" rows={3} {...form.register('company_address')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company_tax_id">SIRET / N° TVA</Label>
              <Input id="company_tax_id" {...form.register('company_tax_id')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="iban">IBAN</Label>
              <Input id="iban" {...form.register('iban')} />
            </div>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Enregistrer
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/80">
        <CardHeader>
          <CardTitle>{t('settings.demo')}</CardTitle>
          <CardDescription>Clients fictifs et feuille d’exemple pour tester le parcours.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="secondary" onClick={() => void demo.mutate()} disabled={demo.isPending}>
            {demo.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {t('settings.demoBtn')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
