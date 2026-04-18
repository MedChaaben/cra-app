import { rgb } from 'pdf-lib'

import type { InvoicePdfTemplateId } from './types'

export type InvoicePdfTheme = {
  accent: ReturnType<typeof rgb>
  accentSoft: ReturnType<typeof rgb>
  muted: ReturnType<typeof rgb>
  tableHeaderBg: ReturnType<typeof rgb>
  tableHeaderFg: ReturnType<typeof rgb>
  zebra: ReturnType<typeof rgb>
  montantCol: ReturnType<typeof rgb>
  footer: ReturnType<typeof rgb>
  headerTitleColor: ReturnType<typeof rgb>
  showTopBand: boolean
  showLeftBar: boolean
  leftBarWidth: number
  titleSize: number
  tableBorder: number
  tagline: { fr: string; en: string } | null
}

function hexToRgb(hex: string): ReturnType<typeof rgb> | null {
  let s = hex.trim().replace('#', '')
  if (s.length === 3) {
    s = s
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null
  const n = parseInt(s, 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

function pickRgb(hex: string | null | undefined, fallback: ReturnType<typeof rgb>): ReturnType<typeof rgb> {
  if (!hex?.trim()) return fallback
  return hexToRgb(hex) ?? fallback
}

const gray = {
  muted: rgb(0.58, 0.58, 0.58),
  tableHeaderBg: rgb(0.92, 0.92, 0.92),
  tableHeaderFg: rgb(0, 0, 0),
  zebra: rgb(0.97, 0.97, 0.97),
  montantCol: rgb(0.94, 0.94, 0.94),
  footer: rgb(0.35, 0.35, 0.35),
}

const THEME_BASE: Record<InvoicePdfTemplateId, Omit<InvoicePdfTheme, 'accent' | 'accentSoft'> & { accent: ReturnType<typeof rgb>; accentSoft: ReturnType<typeof rgb> }> = {
  minimal: {
    accent: rgb(0.2, 0.2, 0.2),
    accentSoft: rgb(0.45, 0.45, 0.45),
    muted: gray.muted,
    tableHeaderBg: rgb(0.96, 0.96, 0.96),
    tableHeaderFg: rgb(0, 0, 0),
    zebra: rgb(1, 1, 1),
    montantCol: rgb(0.98, 0.98, 0.98),
    footer: rgb(0.42, 0.42, 0.42),
    headerTitleColor: rgb(0.35, 0.35, 0.35),
    showTopBand: false,
    showLeftBar: false,
    leftBarWidth: 0,
    titleSize: 24,
    tableBorder: 0.35,
    tagline: null,
  },
  corporate: {
    accent: rgb(0.07, 0.22, 0.45),
    accentSoft: rgb(0.12, 0.35, 0.72),
    muted: gray.muted,
    tableHeaderBg: rgb(0.07, 0.22, 0.45),
    tableHeaderFg: rgb(1, 1, 1),
    zebra: rgb(0.98, 0.99, 1),
    montantCol: rgb(0.93, 0.95, 0.99),
    footer: rgb(0.28, 0.32, 0.4),
    headerTitleColor: rgb(0.07, 0.22, 0.45),
    showTopBand: true,
    showLeftBar: false,
    leftBarWidth: 0,
    titleSize: 26,
    tableBorder: 0.55,
    tagline: null,
  },
  luxe: {
    accent: rgb(0.45, 0.32, 0.15),
    accentSoft: rgb(0.71, 0.52, 0.2),
    muted: rgb(0.5, 0.46, 0.42),
    tableHeaderBg: rgb(0.96, 0.94, 0.9),
    tableHeaderFg: rgb(0.25, 0.2, 0.14),
    zebra: rgb(0.99, 0.98, 0.96),
    montantCol: rgb(0.97, 0.95, 0.91),
    footer: rgb(0.35, 0.3, 0.24),
    headerTitleColor: rgb(0.45, 0.32, 0.15),
    showTopBand: false,
    showLeftBar: true,
    leftBarWidth: 5,
    titleSize: 28,
    tableBorder: 0.45,
    tagline: null,
  },
  consultant_it: {
    accent: rgb(0.05, 0.65, 0.78),
    accentSoft: rgb(0.02, 0.12, 0.18),
    muted: rgb(0.45, 0.52, 0.58),
    tableHeaderBg: rgb(0.04, 0.09, 0.12),
    tableHeaderFg: rgb(0.86, 0.93, 0.98),
    zebra: rgb(0.97, 0.98, 0.99),
    montantCol: rgb(0.92, 0.95, 0.98),
    footer: rgb(0.22, 0.28, 0.34),
    headerTitleColor: rgb(0.02, 0.12, 0.18),
    showTopBand: true,
    showLeftBar: false,
    leftBarWidth: 0,
    titleSize: 22,
    tableBorder: 0.5,
    tagline: {
      fr: 'Prestations intellectuelles — ingénierie & delivery',
      en: 'Professional services — engineering & delivery',
    },
  },
}

export function resolveInvoiceTheme(
  template: InvoicePdfTemplateId,
  brandPrimary: string | null | undefined,
  brandSecondary: string | null | undefined,
): InvoicePdfTheme {
  const base = THEME_BASE[template]
  const accent = pickRgb(brandPrimary, base.accent)
  const accentSoft = pickRgb(brandSecondary, base.accentSoft)
  if (template === 'corporate' || template === 'consultant_it') {
    return {
      ...base,
      accent,
      accentSoft,
      tableHeaderBg: accent,
      tableHeaderFg: rgb(1, 1, 1),
      headerTitleColor: accentSoft,
    }
  }
  if (template === 'luxe') {
    return {
      ...base,
      accent,
      accentSoft,
      headerTitleColor: accent,
      tableHeaderBg: rgb(0.96, 0.94, 0.9),
      tableHeaderFg: rgb(0.25, 0.2, 0.14),
    }
  }
  if (template === 'minimal') {
    return {
      ...base,
      accent,
      accentSoft,
      headerTitleColor: accent,
    }
  }
  return { ...base, accent, accentSoft }
}
