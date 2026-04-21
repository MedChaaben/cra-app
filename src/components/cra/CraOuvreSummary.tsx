import { CalendarDays } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import { computeCraOuvreMonthStats, craOuvreFillRatio, type CraEntryLite } from '@/lib/craOuvreStats'

type Variant = 'panel' | 'inline' | 'compact'

function formatDays(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value)
}

function OuvreRing({ ratio, size = 52 }: { ratio: number; size?: number }) {
  const stroke = 4
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = c * (1 - Math.min(1, Math.max(0, ratio)))
  const cx = size / 2
  const cy = size / 2

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90" aria-hidden>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        className="stroke-muted-foreground/20"
        strokeWidth={stroke}
      />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        className="stroke-sky-600 transition-[stroke-dashoffset] duration-500 ease-out dark:stroke-sky-400"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={dash}
      />
    </svg>
  )
}

type Props = {
  year: number
  month: number
  entries: CraEntryLite[]
  variant?: Variant
  className?: string
}

export function CraOuvreSummary({ year, month, entries, variant = 'panel', className }: Props) {
  const { t, i18n } = useTranslation()
  const loc = i18n.language === 'en' ? 'en-US' : 'fr-FR'

  const stats = useMemo(() => computeCraOuvreMonthStats(year, month, entries), [year, month, entries])
  const ratio = useMemo(() => craOuvreFillRatio(stats), [stats])

  const worked = formatDays(stats.workedOnOuvres, loc)
  const total = String(stats.ouvresInMonth)
  const extra = stats.workedOnWeekend + stats.workedOnHolidays

  if (variant === 'compact') {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-2 rounded-md border border-sky-200/60 bg-sky-50/80 px-2 py-1 text-xs tabular-nums dark:border-sky-800/50 dark:bg-sky-950/35',
          className,
        )}
        title={t('editor.craOuvre.hintCapacity', { total })}
      >
        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />
        <span className="font-semibold text-sky-950 dark:text-sky-100">{worked}</span>
        <span className="text-muted-foreground">/</span>
        <span className="text-muted-foreground">{total}</span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('editor.craOuvre.unitShort')}</span>
      </div>
    )
  }

  if (variant === 'inline') {
    return (
      <div className={cn('flex min-w-0 flex-1 items-center gap-3', className)}>
        <OuvreRing ratio={ratio} size={40} />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold tabular-nums text-foreground">
            <span className="text-sky-700 dark:text-sky-300">{worked}</span>
            <span className="mx-1 font-normal text-muted-foreground">/</span>
            <span>{total}</span>
            <span className="ml-1 text-xs font-medium text-muted-foreground">{t('editor.craOuvre.unit')}</span>
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 transition-[width] duration-500 ease-out dark:from-sky-400 dark:to-cyan-400"
              style={{ width: `${ratio * 100}%` }}
            />
          </div>
          {extra > 0 ? (
            <p className="text-[11px] text-muted-foreground">{t('editor.craOuvre.extraOther', { count: formatDays(extra, loc) })}</p>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-xl border border-border/70 bg-gradient-to-br from-sky-50/90 via-background to-muted/30 p-4 shadow-sm dark:from-sky-950/25 dark:via-background dark:to-muted/20 sm:flex-row sm:items-center',
        className,
      )}
    >
      <OuvreRing ratio={ratio} size={56} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('editor.craOuvre.title')}</p>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">
          <span className="text-sky-700 dark:text-sky-300">{worked}</span>
          <span className="mx-1.5 text-lg font-normal text-muted-foreground">/</span>
          <span className="text-lg text-muted-foreground">{total}</span>
        </p>
        <p className="text-xs font-medium text-muted-foreground">{t('editor.craOuvre.unit')}</p>
        <p className="text-xs text-muted-foreground">{t('editor.craOuvre.hintCapacity', { total })}</p>
        {extra > 0 ? (
          <p className="text-xs font-medium text-amber-800/90 dark:text-amber-200/90">
            {t('editor.craOuvre.extraOther', { count: formatDays(extra, loc) })}
          </p>
        ) : null}
      </div>
    </div>
  )
}
