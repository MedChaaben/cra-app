import { Outlet } from 'react-router-dom'

/** Contenu classique : défilement vertical dans la zone sous le header (pas de scroll du document). */
export function MainScrollLayout() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain">
      <Outlet />
    </div>
  )
}
