import { ChevronDown, Menu, Moon, SunMedium } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useTheme } from 'next-themes'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/store/uiStore'

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-accent text-accent-foreground shadow-sm'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  )

const primaryNav = [
  { to: '/', key: 'dashboard', end: true },
  { to: '/timesheets', key: 'timesheets', end: false },
  { to: '/invoices', key: 'invoices', end: false },
] as const

const secondaryNav = [
  { to: '/import', key: 'import' },
  { to: '/clients', key: 'clients' },
  { to: '/settings', key: 'settings' },
] as const

function isPathActive(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/'
  return pathname === to || pathname.startsWith(`${to}/`)
}

function getUserDisplayName(user: { email?: string | null; user_metadata?: unknown } | null): string {
  if (!user) return ''
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const fullName = typeof meta.full_name === 'string' ? meta.full_name.trim() : ''
  if (fullName) return fullName
  const name = typeof meta.name === 'string' ? meta.name.trim() : ''
  if (name) return name
  return user.email ?? ''
}

function getInitials(label: string): string {
  const cleaned = label.trim()
  if (!cleaned) return '??'
  const parts = cleaned
    .split(/\s+/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
  }
  const compact = cleaned.replace(/[^A-Za-z0-9À-ÿ]/g, '')
  return compact.slice(0, 2).toUpperCase()
}

export function AppShell() {
  const { t, i18n } = useTranslation()
  const { user, signOut } = useAuth()
  const { theme, setTheme } = useTheme()
  const { pathname } = useLocation()
  const { mobileNavOpen, setMobileNavOpen } = useUiStore()
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const displayName = getUserDisplayName(user)
  const userInitials = getInitials(displayName)
  const secondaryActive = secondaryNav.some((item) => isPathActive(pathname, item.to))
  const closeMobileMenu = () => {
    setMobileNavOpen(false)
    setMobileMoreOpen(false)
  }

  return (
    <TooltipProvider>
      <div className="flex min-h-svh flex-col overflow-x-clip bg-background">
        <header className="sticky top-0 z-40 shrink-0 border-b border-border bg-card/80 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Menu"
              onClick={() => {
                if (mobileNavOpen) setMobileMoreOpen(false)
                setMobileNavOpen(!mobileNavOpen)
              }}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs text-primary-foreground">
                C
              </span>
              <span className="hidden sm:inline">{t('appName')}</span>
            </Link>
            <nav className="ml-auto hidden items-center gap-1 md:flex">
              {primaryNav.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
                  {t(`nav.${item.key}`)}
                </NavLink>
              ))}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'h-9 gap-1.5 rounded-lg px-3 text-sm font-medium',
                      secondaryActive
                        ? 'bg-accent text-accent-foreground shadow-sm hover:bg-accent'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {t('nav.more')}
                    <ChevronDown className="h-4 w-4 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  {secondaryNav.map((item) => (
                    <DropdownMenuItem
                      key={item.to}
                      asChild
                      className={cn(
                        'font-medium',
                        isPathActive(pathname, item.to) && 'bg-accent text-accent-foreground'
                      )}
                    >
                      <Link to={item.to}>{t(`nav.${item.key}`)}</Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </nav>
            <div className="ml-auto flex items-center gap-2 md:ml-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Thème"
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  >
                    <span className="dark:hidden">
                      <SunMedium className="h-5 w-5" />
                    </span>
                    <span className="hidden dark:inline">
                      <Moon className="h-5 w-5" />
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Thème clair / sombre</TooltipContent>
              </Tooltip>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="hidden sm:inline-flex"
                onClick={() => void i18n.changeLanguage(i18n.language === 'fr' ? 'en' : 'fr')}
              >
                {i18n.language === 'fr' ? 'EN' : 'FR'}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-9 w-9 rounded-full font-semibold tracking-wide"
                    aria-label={displayName || 'Utilisateur'}
                    title={displayName || undefined}
                  >
                    {userInitials}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>{displayName || t('auth.login')}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault()
                      void signOut()
                    }}
                  >
                    {t('auth.logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {mobileNavOpen ? (
            <div className="border-t border-border bg-card px-4 py-3 md:hidden">
              <nav className="flex flex-col gap-1">
                {primaryNav.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={navClass}
                    onClick={closeMobileMenu}
                  >
                    {t(`nav.${item.key}`)}
                  </NavLink>
                ))}
                <div className="my-2 h-px bg-border" />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'justify-between rounded-lg px-3 py-2 text-sm font-medium',
                    secondaryActive || mobileMoreOpen
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                  onClick={() => setMobileMoreOpen((open) => !open)}
                >
                  {t('nav.more')}
                  <ChevronDown className={cn('h-4 w-4 transition-transform', mobileMoreOpen && 'rotate-180')} />
                </Button>
                {mobileMoreOpen ? (
                  <div className="ml-2 flex flex-col gap-1 border-l border-border pl-2">
                    {secondaryNav.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={navClass}
                        onClick={closeMobileMenu}
                      >
                        {t(`nav.${item.key}`)}
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </nav>
            </div>
          ) : null}
        </header>
        <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-4 py-4 sm:px-6 sm:py-4">
          <Outlet />
        </main>
      </div>
    </TooltipProvider>
  )
}
