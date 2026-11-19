import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useMeta } from '@/hooks/useMeta'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/Button'
import { Field, FormError, Input } from '@/components/ui/Form'
import { useAuth } from './AuthProvider'
import { AuthCard } from './AuthLayout'

export function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const { signIn } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!identifier.trim()) return setError('Inserisci nome utente o email.')
    if (!password) return setError('Inserisci la password.')
    setLoading(true)
    try {
      await signIn(identifier, password)
      onSuccess()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Nome utente o email" required><Input autoComplete="username" autoCapitalize="none" spellCheck={false} value={identifier} onChange={(e) => setIdentifier(e.target.value)} /></Field>
      <Field label="Password" required><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      <div className="text-right text-sm">
        <Link to="/password-dimenticata" className="font-medium text-ink-600 underline-offset-4 hover:text-ink-900 hover:underline">Password dimenticata?</Link>
      </div>
      <FormError message={error} />
      <Button type="submit" size="lg" className="w-full" loading={loading}>Accedi</Button>
    </form>
  )
}

export default function LoginPage() {
  const { user, loading, disabled } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/account'
  useMeta({ title: 'Accedi', noindex: true })

  useEffect(() => {
    if (!loading && user) navigate(from, { replace: true })
  }, [user, loading, from, navigate])

  return (
    <AuthCard
      title="Accedi"
      description="Accedi per completare l’ordine e seguire le tue spedizioni."
      footer={<>Non hai un account? <Link to="/registrati" state={{ from }} className="font-semibold text-ink-900 underline underline-offset-4">Registrati</Link></>}
    >
      {disabled && <div className="mb-4"><FormError message="Il tuo account è stato disattivato. Contattaci per assistenza." /></div>}
      <LoginForm onSuccess={() => navigate(from, { replace: true })} />
    </AuthCard>
  )
}
