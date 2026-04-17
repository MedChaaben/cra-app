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
  email: z.string().email(),
  password: z.string().min(6),
})

type FormValues = z.infer<typeof schema>

export default function LoginPage() {
  const { t } = useTranslation()
  const { user, loading, signIn } = useAuth()
  const form = useForm<FormValues>({ resolver: zodResolver(schema) })

  if (!loading && user) {
    return <Navigate to="/" replace />
  }

  const onSubmit = form.handleSubmit(async (values) => {
    const { error } = await signIn(values.email, values.password)
    if (error) {
      toast.error(error)
      return
    }
    toast.success('Bienvenue')
  })

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-muted/40 px-4 py-12">
      <div className="mb-10 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground shadow-lg shadow-primary/25">
          C
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('appName')}</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Saisie intelligente de feuilles de temps et facturation premium.
        </p>
      </div>
      <Card className="w-full max-w-md border-border/80 shadow-xl">
        <CardHeader>
          <CardTitle>{t('auth.login')}</CardTitle>
          <CardDescription>Accédez à votre espace sécurisé.</CardDescription>
        </CardHeader>
        <CardContent>
          {!isSupabaseConfigured ? (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100">
              Configurez <code className="font-mono">VITE_SUPABASE_URL</code> et{' '}
              <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> dans un fichier{' '}
              <code className="font-mono">.env</code> à la racine du projet.
            </p>
          ) : null}
          <form className="mt-4 space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
              {form.formState.errors.email ? (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input id="password" type="password" autoComplete="current-password" {...form.register('password')} />
              {form.formState.errors.password ? (
                <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
              ) : null}
            </div>
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting || !isSupabaseConfigured}>
              {t('auth.login')}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Pas encore de compte ?{' '}
            <Link to="/signup" className="font-medium text-primary hover:underline">
              {t('auth.signup')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
