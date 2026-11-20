import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMeta } from '@/hooks/useMeta'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/Button'
import { Field, FormError, Input } from '@/components/ui/Form'
import { useUi } from '@/components/ui/Toast'
import { PageLoader } from '@/components/ui/Spinner'
import { useAuth } from './AuthProvider'
import { AuthCard } from './AuthLayout'

/** Atterraggio dal link email di Supabase (sessione di recupero già attiva). */
export default function ResetPasswordPage() {
  const { updatePassword, user, isAdmin, loading: authLoading } = useAuth()
  const { toast } = useUi()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useMeta({ title: 'Nuova password', noindex: true })

  if (authLoading) return <PageLoader />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8) return setError('La password deve contenere almeno 8 caratteri.')
    if (password !== confirm) return setError('Le password non coincidono.')
    setLoading(true)
    try {
      await updatePassword(password)
      toast('Password aggiornata')
      navigate(isAdmin ? '/admin' : '/account', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthCard title="Imposta una nuova password">
      {!user ? (
        <FormError message="Il link non è valido o è scaduto. Richiedi un nuovo link di recupero." />
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Nuova password" required hint="Almeno 8 caratteri"><Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <Field label="Conferma password" required><Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
          <FormError message={error} />
          <Button type="submit" size="lg" className="w-full" loading={loading}>Salva password</Button>
        </form>
      )}
    </AuthCard>
  )
}
