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
import { Separator } from '@/components/ui/separator'
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

export function AppShell() {
  const { t, i18n } = useTranslation()
  const { user, signOut } = useAuth()
  const { theme, setTheme } = useTheme()
  const { mobileNavOpen, setMobileNavOpen } = useUiStore()

  return (
    <TooltipProvider>
      <div className="min-h-dvh bg-background">
        <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
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
                  <Button variant="secondary" size="sm" className="max-w-[160px] truncate">
                    {user?.email}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>{t('auth.login')}</DropdownMenuLabel>
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
        <Separator className="opacity-0" />
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <Outlet />
        </main>
      </div>
    </TooltipProvider>
  )
}
