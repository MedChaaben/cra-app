import { Menu, Moon, SunMedium } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet } from 'react-router-dom'
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
  const { mobileNavOpen, setMobileNavOpen } = useUiStore()
  const displayName = getUserDisplayName(user)
  const userInitials = getInitials(displayName)

  return (
    <TooltipProvider>
      <div className="flex h-svh flex-col overflow-hidden bg-background">
        <header className="sticky top-0 z-40 shrink-0 border-b border-border bg-card/80 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Menu"
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
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
              <NavLink to="/" end className={navClass}>
                {t('nav.dashboard')}
              </NavLink>
              <NavLink to="/import" className={navClass}>
                {t('nav.import')}
              </NavLink>
              <NavLink to="/timesheets" className={navClass}>
                {t('nav.timesheets')}
              </NavLink>
              <NavLink to="/clients" className={navClass}>
                {t('nav.clients')}
              </NavLink>
              <NavLink to="/invoices" className={navClass}>
                {t('nav.invoices')}
              </NavLink>
              <NavLink to="/settings" className={navClass}>
                {t('nav.settings')}
              </NavLink>
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
              <nav className="flex flex-col gap-1" onClick={() => setMobileNavOpen(false)}>
                <NavLink to="/" end className={navClass}>
                  {t('nav.dashboard')}
                </NavLink>
                <NavLink to="/import" className={navClass}>
                  {t('nav.import')}
                </NavLink>
                <NavLink to="/timesheets" className={navClass}>
                  {t('nav.timesheets')}
                </NavLink>
                <NavLink to="/clients" className={navClass}>
                  {t('nav.clients')}
                </NavLink>
                <NavLink to="/invoices" className={navClass}>
                  {t('nav.invoices')}
                </NavLink>
                <NavLink to="/settings" className={navClass}>
                  {t('nav.settings')}
                </NavLink>
              </nav>
            </div>
          ) : null}
        </header>
        <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col overflow-hidden px-4 py-4 sm:px-6 sm:py-4">
          <Outlet />
        </main>
      </div>
    </TooltipProvider>
  )
}
