import { Check } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import { INVOICE_PDF_TEMPLATE_IDS, type InvoicePdfTemplateId } from '@/services/pdf/invoice/types'

type VisualDefaults = {
  accent: string
  soft: string
  paper: string
  topBand?: boolean
  leftBar?: boolean
}

const VISUAL: Record<InvoicePdfTemplateId, VisualDefaults> = {
  minimal: {
    accent: '#2d2d2d',
    soft: '#737373',
    paper: '#fafafa',
  },
  corporate: {
    accent: '#123874',
    soft: '#1e5bb8',
    paper: '#f8fafc',
    topBand: true,
  },
  luxe: {
    accent: '#735228',
    soft: '#b68533',
    paper: '#fdf8f3',
    leftBar: true,
  },
  consultant_it: {
    accent: '#0da5c8',
    soft: '#041f2e',
    paper: '#f4f9fb',
    topBand: true,
  },
}

function normalizeHex(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  let s = raw.trim()
  if (!s.startsWith('#')) s = `#${s}`
  s = s.slice(0, 7)
  const body = s.slice(1)
  if (body.length === 3 && /^[0-9a-fA-F]{3}$/.test(body)) {
    const exp = body
      .split('')
      .map((c) => c + c)
      .join('')
    return `#${exp}`
  }
  if (body.length === 6 && /^[0-9a-fA-F]{6}$/.test(body)) return s.toLowerCase()
  return null
}

function pickAccent(template: InvoicePdfTemplateId, brandPrimary: string | null | undefined): string {
  return normalizeHex(brandPrimary) ?? VISUAL[template].accent
}

function pickSoft(template: InvoicePdfTemplateId, brandSecondary: string | null | undefined): string {
  return normalizeHex(brandSecondary) ?? VISUAL[template].soft
}

function MiniInvoicePreview({
  template,
  brandPrimary,
  brandSecondary,
}: {
  template: InvoicePdfTemplateId
  brandPrimary?: string | null
  brandSecondary?: string | null
}) {
  const v = VISUAL[template]
  const accent = pickAccent(template, brandPrimary)
  const soft = pickSoft(template, brandSecondary)

  return (
    <div
      className="relative h-[5.25rem] w-full overflow-hidden rounded-md border border-black/10 shadow-inner"
      style={{ backgroundColor: v.paper }}
      aria-hidden
    >
      {v.leftBar ? (
        <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: accent }} />
      ) : null}
      <div className={cn('flex h-full flex-col pl-1.5', v.leftBar && 'pl-2')}>
        {v.topBand ? <div className="h-1 w-full shrink-0 rounded-sm" style={{ backgroundColor: accent }} /> : null}
        <div className="flex flex-1 flex-col gap-1 p-1.5 pt-1">
          <div className="flex items-start justify-between gap-1">
            <div className="h-1.5 w-[42%] rounded-sm bg-black/20" />
            <div className="h-2 w-[22%] rounded-sm" style={{ backgroundColor: soft, opacity: 0.85 }} />
          </div>
          <div
            className={cn(
              'flex h-4 w-full items-center rounded px-0.5',
              template === 'consultant_it' ? 'justify-between' : 'gap-0.5',
            )}
            style={{
              backgroundColor:
                template === 'consultant_it'
                  ? soft
                  : template === 'corporate'
                    ? accent
                    : template === 'luxe'
                      ? '#e8dfd4'
                      : '#e6e6e6',
            }}
          >
            {template === 'consultant_it' ? (
              <>
                <div className="h-1 w-1/4 rounded-sm bg-white/30" />
                <div className="h-1 w-1/5 rounded-sm bg-white/22" />
              </>
            ) : template === 'corporate' ? (
              <>
                <div className="h-1 w-1/5 rounded-sm bg-white/45" />
                <div className="h-1 w-1/6 rounded-sm bg-white/35" />
                <div className="h-1 w-1/6 rounded-sm bg-white/35" />
              </>
            ) : (
              <>
                <div className="h-1 w-1/5 rounded-sm bg-black/14" />
                <div className="h-1 w-1/6 rounded-sm bg-black/10" />
                <div className="h-1 w-1/6 rounded-sm bg-black/10" />
              </>
            )}
          </div>
          <div className="flex flex-1 flex-col justify-center gap-0.5">
            <div className="h-1 w-full rounded-sm bg-black/[0.07]" />
            <div className="h-1 w-[92%] rounded-sm bg-black/[0.05]" />
            <div className="h-1 w-[88%] rounded-sm bg-black/[0.05]" />
          </div>
        </div>
      </div>
    </div>
  )
}

export type InvoiceTemplatePickerProps = {
  value: InvoicePdfTemplateId
  onChange: (id: InvoicePdfTemplateId) => void
  brandPrimary?: string | null
  brandSecondary?: string | null
  disabled?: boolean
}

export function InvoiceTemplatePicker({
  value,
  onChange,
  brandPrimary,
  brandSecondary,
  disabled,
}: InvoiceTemplatePickerProps) {
  const { t } = useTranslation()
  const groupId = useId()
  const radioName = `invoice-pdf-template-${groupId.replace(/:/g, '')}`

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p id={groupId} className="text-sm font-medium leading-none">
            {t('invoices.invoiceForm.templateVisualLabel')}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">{t('invoices.invoiceForm.templateVisualHint')}</p>
        </div>
      </div>
      <div
        role="radiogroup"
        aria-labelledby={groupId}
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {INVOICE_PDF_TEMPLATE_IDS.map((id) => {
          const selected = value === id
          return (
            <label
              key={id}
              className={cn(
                'group relative cursor-pointer rounded-xl border-2 bg-card p-3 text-left shadow-sm transition-all',
                'hover:border-primary/35 hover:shadow-md',
                'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
                selected ? 'border-primary ring-2 ring-primary/25 shadow-md' : 'border-border/70',
                disabled && 'pointer-events-none opacity-50',
              )}
            >
              <input
                type="radio"
                name={radioName}
                value={id}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(id)}
                className="sr-only"
              />
              <MiniInvoicePreview template={id} brandPrimary={brandPrimary} brandSecondary={brandSecondary} />
              <p className="mt-2.5 text-sm font-semibold tracking-tight">{t(`settings.template.${id}`)}</p>
              <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">
                {t(`invoices.invoiceForm.templateDesc.${id}`)}
              </p>
              {selected ? (
                <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                  <Check className="h-3 w-3 stroke-[3]" aria-hidden />
                </span>
              ) : null}
            </label>
          )
        })}
      </div>
    </div>
  )
}
