import type { ReactNode } from 'react'
import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from '@/components/layout/AppShell'
import { Skeleton } from '@/components/ui/skeleton'
import { isSupabaseConfigured } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'

const LoginPage = lazy(() => import('@/pages/LoginPage'))
const SignupPage = lazy(() => import('@/pages/SignupPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const ImportPage = lazy(() => import('@/pages/ImportPage'))
const TimesheetEditorPage = lazy(() => import('@/pages/TimesheetEditorPage'))
const InvoicesPage = lazy(() => import('@/pages/InvoicesPage'))
const TimesheetsPage = lazy(() => import('@/pages/TimesheetsPage'))
const InvoiceNewPage = lazy(() => import('@/pages/InvoiceNewPage'))
const InvoiceEditPage = lazy(() => import('@/pages/InvoiceEditPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const ClientsPage = lazy(() => import('@/pages/ClientsPage'))

function PageFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (!isSupabaseConfigured) {
    return <Navigate to="/login" replace />
  }
  if (loading) {
    return <PageFallback />
  }
  if (!user) {
    return <Navigate to="/login" replace />
  }
  return children
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route
            path="/"
            element={
              <Protected>
                <AppShell />
              </Protected>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="import" element={<ImportPage />} />
            <Route path="timesheets" element={<TimesheetsPage />} />
            <Route path="timesheets/:id/edit" element={<TimesheetEditorPage />} />
            <Route path="clients" element={<ClientsPage />} />
            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="invoices/new" element={<InvoiceNewPage />} />
            <Route path="invoices/:id" element={<InvoiceEditPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
