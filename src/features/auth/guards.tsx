import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { PageLoader } from '@/components/ui/Spinner'
import { useAuth } from './AuthProvider'

/** Protegge le pagine riservate ai clienti autenticati. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/accedi" replace state={{ from: location.pathname + location.search }} />
  return <>{children}</>
}

/** Protegge il backoffice: solo profili con ruolo admin. La sicurezza reale è garantita dalle policy RLS. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, profile, isAdmin, loading } = useAuth()
  const location = useLocation()
  if (loading || (user && !profile)) return <PageLoader />
  if (!user) return <Navigate to="/admin/accedi" replace state={{ from: location.pathname }} />
  if (!isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}
