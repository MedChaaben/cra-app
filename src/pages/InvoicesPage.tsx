import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase/client'
import type { Invoice } from '@/types/models'

export default function InvoicesPage() {
  const { t } = useTranslation()
  const { user } = useAuth()

  const q = useQuery({
    queryKey: ['invoices-all', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<Invoice[]> => {
      const { data, error } = await supabase.from('invoices').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Invoice[]
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t('invoices.title')}</h1>
          <p className="text-muted-foreground">Historique et montants TTC.</p>
        </div>
        <Button asChild>
          <Link to="/invoices/new">
            <Plus className="h-4 w-4" />
            {t('invoices.new')}
          </Link>
        </Button>
      </div>

      <Card className="border-border/80">
        <CardHeader>
          <CardTitle>Liste</CardTitle>
          <CardDescription>Documents générés depuis CRA Studio.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {q.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : q.data?.length ? (
            q.data.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-col gap-1 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{inv.invoice_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {inv.issue_date} · {inv.status}
                  </p>
                </div>
                <p className="text-lg font-semibold tabular-nums">
                  {new Intl.NumberFormat(undefined, { style: 'currency', currency: inv.currency }).format(inv.total_ttc)}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Aucune facture pour le moment.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
