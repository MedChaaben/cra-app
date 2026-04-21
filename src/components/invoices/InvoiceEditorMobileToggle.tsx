import { FileText, PencilLine } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

export type InvoiceEditorMobilePanel = 'edit' | 'preview'

type Props = {
  value: InvoiceEditorMobilePanel
  onChange: (panel: InvoiceEditorMobilePanel) => void
  /** Panneau formulaire (pour aria-controls). */
  formPanelId: string
  /** Panneau aperçu PDF. */
  previewPanelId: string
  className?: string
}

export function InvoiceEditorMobileToggle({ value, onChange, formPanelId, previewPanelId, className }: Props) {
  const { t } = useTranslation()

  return (
    <div
      role="tablist"
      aria-label={t('invoices.invoiceForm.mobileToggleAria')}
      className={cn(
        'grid shrink-0 grid-cols-2 gap-1 rounded-xl border border-border/70 bg-muted/35 p-1 shadow-sm backdrop-blur-sm lg:hidden',
        className,
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === 'edit'}
        aria-controls={formPanelId}
        id={`${formPanelId}-tab`}
        onClick={() => onChange('edit')}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
          value === 'edit'
            ? 'bg-card text-foreground shadow-sm ring-1 ring-border/60'
            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
        )}
      >
        <PencilLine className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
        {t('invoices.invoiceForm.mobileTabEdit')}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === 'preview'}
        aria-controls={previewPanelId}
        id={`${previewPanelId}-tab`}
        onClick={() => onChange('preview')}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
          value === 'preview'
            ? 'bg-card text-foreground shadow-sm ring-1 ring-border/60'
            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
        )}
      >
        <FileText className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
        {t('invoices.invoiceForm.mobileTabPreview')}
      </button>
    </div>
  )
}
