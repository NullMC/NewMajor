import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useMeta } from '@/hooks/useMeta'
import { FormError } from '@/components/ui/Form'
import { useAuth } from '@/features/auth/AuthProvider'
import { LoginForm } from '@/features/auth/LoginPage'

export default function AdminLoginPage() {
  const { user, isAdmin, profile, loading, profileReady, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/admin'
  useMeta({ title: 'Backoffice', noindex: true })

  useEffect(() => {
    if (!loading && profileReady && user && isAdmin) navigate(from, { replace: true })
  }, [user, isAdmin, loading, profileReady, from, navigate])

  return (
    <main className="flex min-h-dvh items-center justify-center bg-ink-900 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-pop sm:p-8">
        <img src="/brand/logo.png" alt="New Major" className="h-12 w-auto" />
        <h1 className="mt-5 text-xl font-bold">Accesso backoffice</h1>
        <p className="mt-1 text-sm text-ink-500">Area riservata agli amministratori.</p>
        <div className="mt-6 space-y-4">
          {user && profile && !isAdmin ? (
            <>
              <FormError message="Questo account non ha i permessi di amministratore." />
              <div className="flex flex-col gap-2 text-sm">
                <Link to="/account" className="font-semibold text-ink-900 underline underline-offset-4">Vai alla tua area personale</Link>
                <button type="button" onClick={() => void signOut()} className="text-left font-medium text-ink-600 underline-offset-4 hover:underline">Esci e accedi con un altro account</button>
              </div>
            </>
          ) : (
            <LoginForm onSuccess={() => undefined} />
          )}
        </div>
      </div>
    </main>
  )
}
