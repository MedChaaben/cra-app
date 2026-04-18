/** Aligne les statuts Supabase (`draft`, `sent`) sur l’affichage métier (`pending`). */
export function normalizeInvoiceDbStatus(status: string): 'pending' | 'paid' | 'archived' {
  if (status === 'paid') return 'paid'
  if (status === 'archived') return 'archived'
  return 'pending'
}

export function invoiceMatchesStatusFilter(
  status: string,
  filter: 'all' | 'pending' | 'paid' | 'archived',
): boolean {
  if (filter === 'all') return true
  return normalizeInvoiceDbStatus(status) === filter
}
