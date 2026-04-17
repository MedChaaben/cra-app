import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/useAuth'
import { isSupabaseConfigured } from '@/lib/supabase/client'

const schema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
})

type FormValues = z.infer<typeof schema>

export default function SignupPage() {
  const { t } = useTranslation()
  const { user, loading, signUp } = useAuth()
  const form = useForm<FormValues>({ resolver: zodResolver(schema) })

  if (!loading && user) {
    return <Navigate to="/" replace />
  }

  const onSubmit = form.handleSubmit(async (values) => {
    const { error } = await signUp(values.email, values.password, values.fullName)
    if (error) {
      toast.error(error)
      return
    }
    toast.message('Vérifiez votre boîte mail pour confirmer le compte si l’option est activée.')
  })

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-muted/40 px-4 py-12">
      <Card className="w-full max-w-md border-border/80 shadow-xl">
        <CardHeader>
          <CardTitle>{t('auth.signup')}</CardTitle>
          <CardDescription>Quelques secondes pour démarrer.</CardDescription>
        </CardHeader>
        <CardContent>
          {!isSupabaseConfigured ? (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100">
              Supabase n’est pas configuré. Ajoutez les variables d’environnement avant de créer un compte.
            </p>
          ) : null}
          <form className="mt-4 space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="fullName">Nom complet</Label>
              <Input id="fullName" autoComplete="name" {...form.register('fullName')} />
              {form.formState.errors.fullName ? (
                <p className="text-xs text-destructive">{form.formState.errors.fullName.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input id="password" type="password" autoComplete="new-password" {...form.register('password')} />
            </div>
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting || !isSupabaseConfigured}>
              {t('auth.signup')}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Déjà inscrit ?{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">
              {t('auth.login')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
