import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { PageLoader } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Display'
import { useAuth } from './AuthProvider'

// Le guardie migliorano l'esperienza (redirect e messaggi); la sicurezza reale è garantita dalle policy RLS
// e dai controlli nelle funzioni del database.

/** Pagina equivalente del backoffice per un percorso dell'area cliente. */
export function adminEquivalent(pathname: string): string {
  const order = pathname.match(/^\/account\/ordini\/([^/]+)/)
  if (order) return `/admin/ordini/${order[1]}`
  if (pathname.startsWith('/account/ordini')) return '/admin/ordini'
  if (pathname.startsWith('/account/notifiche')) return '/admin/notifiche?tab=mie'
  if (pathname.startsWith('/account/profilo') || pathname.startsWith('/account/indirizzi')) return '/admin/account'
  return '/admin'
}

/** Profilo non leggibile (rete assente o profilo mancante): mai un caricamento infinito. */
function ProfileUnavailable() {
  const { refreshProfile, signOut } = useAuth()
  return (
    <div className="container py-16">
      <EmptyState
        icon={<AlertTriangle className="h-5 w-5" />}
        title="Non riusciamo a caricare il tuo account"
        description="Controlla la connessione e riprova. Se il problema persiste, esci e accedi di nuovo."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => void refreshProfile()}>Riprova</Button>
            <Button variant="secondary" onClick={() => void signOut()}>Esci</Button>
          </div>
        }
      />
    </div>
  )
}

/**
 * Pagine che richiedono un utente autenticato (checkout, conferma ordine).
 * Attende la lettura del profilo, così ruolo e stato dell'account sono noti prima di mostrare la pagina.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, profile, loading, profileReady } = useAuth()
  const location = useLocation()
  if (loading || !profileReady) return <PageLoader />
  if (!user) return <Navigate to="/accedi" replace state={{ from: location.pathname + location.search }} />
  if (!profile) return <ProfileUnavailable />
  return <>{children}</>
}

/** Area personale del cliente: gli amministratori vengono portati alla pagina equivalente del backoffice. */
export function RequireCustomer({ children }: { children: ReactNode }) {
  const { user, profile, isAdmin, loading, profileReady } = useAuth()
  const location = useLocation()
  if (loading || !profileReady) return <PageLoader />
  if (!user) return <Navigate to="/accedi" replace state={{ from: location.pathname + location.search }} />
  if (!profile) return <ProfileUnavailable />
  if (isAdmin) return <Navigate to={adminEquivalent(location.pathname)} replace />
  return <>{children}</>
}

/** Backoffice: solo profili con ruolo admin. Chi non lo è torna all'accesso del backoffice, che spiega il motivo. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, profile, isAdmin, loading, profileReady } = useAuth()
  const location = useLocation()
  if (loading || !profileReady) return <PageLoader />
  if (!user) return <Navigate to="/admin/accedi" replace state={{ from: location.pathname + location.search }} />
  if (!profile) return <ProfileUnavailable />
  if (!isAdmin) return <Navigate to="/admin/accedi" replace />
  return <>{children}</>
}
