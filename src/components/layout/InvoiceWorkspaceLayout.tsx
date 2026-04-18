import { Outlet } from 'react-router-dom'

/**
 * Facture (nouvelle / édition) : pas de scroll sur le conteneur principal ;
 * le scroll est géré à l’intérieur (colonne formulaire + aperçu sur grand écran, page entière sur mobile).
 */
export function InvoiceWorkspaceLayout() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Outlet />
    </div>
  )
}
