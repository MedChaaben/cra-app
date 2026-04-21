import { Outlet } from 'react-router-dom'

/** Contenu classique : le défilement est celui de la page (viewport), avec header sticky dans AppShell. */
export function MainScrollLayout() {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <Outlet />
    </div>
  )
}
