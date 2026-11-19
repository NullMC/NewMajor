import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMeta } from '@/hooks/useMeta'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/Button'
import { Field, FormError, Input } from '@/components/ui/Form'
import { useAuth } from './AuthProvider'
import { AuthCard, isEmail } from './AuthLayout'

export default function ForgotPasswordPage() {
  const { sendPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useMeta({ title: 'Recupera password', noindex: true })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!isEmail(email)) return setError('Inserisci un indirizzo email valido.')
    setLoading(true)
    try {
      await sendPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthCard
      title="Recupera la password"
      description="Ti invieremo un link per impostarne una nuova."
      footer={<Link to="/accedi" className="font-semibold underline underline-offset-4">Torna all’accesso</Link>}
    >
      {sent ? (
        <p role="status" className="rounded-xl bg-success-50 p-4 text-sm text-success-700">
          Se l’indirizzo è registrato riceverai a breve un’email con il link per reimpostare la password.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Email" required><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <FormError message={error} />
          <Button type="submit" size="lg" className="w-full" loading={loading}>Invia link</Button>
          <p className="text-sm text-ink-500">
            Hai creato l’account solo con il nome utente? <Link to="/contatti" className="font-medium text-ink-900 underline underline-offset-4">Contattaci</Link> per reimpostare la password.
          </p>
        </form>
      )}
    </AuthCard>
  )
}
