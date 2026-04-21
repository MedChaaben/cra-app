import { Outlet } from 'react-router-dom'

/**
 * Facture : hauteur calée sur la fenêtre (header h-14 + padding vertical du `main` py-4)
 * pour que la grille formulaire / aperçu reçoive une hauteur définie et que le scroll interne fonctionne.
 */
export function InvoiceWorkspaceLayout() {
  return (
    <div className="flex h-[calc(100dvh-5.5rem)] max-h-[calc(100dvh-5.5rem)] min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
