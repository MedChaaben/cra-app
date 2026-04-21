import { cn } from '@/lib/utils'

/** `span` + `block` : valide dans `<p>`, titres, etc. (évite les erreurs d’imbrication HTML / hydratation). */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn('block animate-pulse rounded-md bg-muted', className)}
      role="status"
      aria-label="Chargement"
      {...props}
    />
  )
}

export { Skeleton }
