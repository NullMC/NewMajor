import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { useMeta } from '@/hooks/useMeta'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, FormError, Input } from '@/components/ui/Form'
import { useAuth } from './AuthProvider'
import { AuthCard, isEmail } from './AuthLayout'

export default function RegisterPage() {
  const { signUp, user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/account'
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '', confirm: '' })
  const [terms, setTerms] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmEmail, setConfirmEmail] = useState(false)
  useMeta({ title: 'Registrati', noindex: true })

  useEffect(() => {
    if (!authLoading && user) navigate(from, { replace: true })
  }, [user, authLoading, from, navigate])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (form.fullName.trim().length < 2) return setError('Inserisci nome e cognome.')
    if (!isEmail(form.email)) return setError('Inserisci un indirizzo email valido.')
    if (form.password.length < 8) return setError('La password deve contenere almeno 8 caratteri.')
    if (form.password !== form.confirm) return setError('Le password non coincidono.')
    if (!terms) return setError('Accetta i termini e prendi visione dell’informativa privacy.')
    setLoading(true)
    try {
      const { needsConfirmation } = await signUp({ email: form.email, password: form.password, fullName: form.fullName, phone: form.phone })
      if (needsConfirmation) setConfirmEmail(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  if (confirmEmail) {
    return (
      <AuthCard title="Conferma la tua email">
        <div className="flex flex-col items-center py-4 text-center">
          <MailCheck className="h-12 w-12 text-gold-600" aria-hidden />
          <p className="mt-4 text-ink-600">
            Ti abbiamo inviato un link di conferma a <strong>{form.email}</strong>. Aprilo per attivare l’account, poi accedi.
          </p>
          <Link to="/accedi" state={{ from }} className="mt-6 font-semibold underline underline-offset-4">Vai all’accesso</Link>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Crea il tuo account"
      description="Serve per completare gli ordini, salvare gli indirizzi e seguire lo stato delle spedizioni."
      footer={<>Hai già un account? <Link to="/accedi" state={{ from }} className="font-semibold text-ink-900 underline underline-offset-4">Accedi</Link></>}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Nome e cognome" required><Input autoComplete="name" value={form.fullName} onChange={set('fullName')} maxLength={120} /></Field>
        <Field label="Email" required><Input type="email" autoComplete="email" value={form.email} onChange={set('email')} /></Field>
        <Field label="Telefono" hint="Utile per comunicazioni sull’ordine"><Input type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} maxLength={40} /></Field>
        <Field label="Password" required hint="Almeno 8 caratteri"><Input type="password" autoComplete="new-password" value={form.password} onChange={set('password')} /></Field>
        <Field label="Conferma password" required><Input type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} /></Field>
        <Checkbox
          checked={terms}
          onChange={(e) => setTerms(e.target.checked)}
          label={<>Accetto i <Link to="/termini-e-condizioni" className="underline underline-offset-4">termini e condizioni</Link> e ho letto l’<Link to="/privacy-policy" className="underline underline-offset-4">informativa privacy</Link></>}
        />
        <FormError message={error} />
        <Button type="submit" size="lg" className="w-full" loading={loading}>Registrati</Button>
      </form>
    </AuthCard>
  )
}
