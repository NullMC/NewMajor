import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { useMeta } from '@/hooks/useMeta'
import { useQuery } from '@/hooks/useQuery'
import { fetchAuthSettings } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, FormError, Input } from '@/components/ui/Form'
import { useAuth } from './AuthProvider'
import { AuthCard, isEmail } from './AuthLayout'
import { USERNAME_HINT, USERNAME_RE, normalizeUsername } from './username'

export default function RegisterPage() {
  const { signUp, user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/account'
  const [form, setForm] = useState({ fullName: '', username: '', email: '', phone: '', password: '', confirm: '' })
  const [terms, setTerms] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmEmail, setConfirmEmail] = useState(false)
  useMeta({ title: 'Registrati', noindex: true })
  // Con "Confirm email" attivo in Supabase la registrazione senza email non può funzionare
  const { data: authSettings } = useQuery('auth:settings', fetchAuthSettings, { staleMs: 300_000 })
  const emailRequired = authSettings?.mailer_autoconfirm === false

  useEffect(() => {
    if (!authLoading && user) navigate(from, { replace: true })
  }, [user, authLoading, from, navigate])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (form.fullName.trim().length < 2) return setError('Inserisci nome e cognome.')
    if (!USERNAME_RE.test(normalizeUsername(form.username))) return setError(`Nome utente non valido. ${USERNAME_HINT}`)
    if (emailRequired && !form.email.trim()) return setError('Inserisci un indirizzo email.')
    if (form.email.trim() && !isEmail(form.email)) return setError(emailRequired ? 'Inserisci un indirizzo email valido.' : 'L’indirizzo email non è valido. Puoi anche lasciarlo vuoto.')
    if (form.password.length < 8) return setError('La password deve contenere almeno 8 caratteri.')
    if (form.password !== form.confirm) return setError('Le password non coincidono.')
    if (!terms) return setError('Accetta i termini e prendi visione dell’informativa privacy.')
    setLoading(true)
    try {
      const { needsConfirmation } = await signUp({ username: form.username, email: form.email, password: form.password, fullName: form.fullName, phone: form.phone })
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
        <Field label="Nome utente" required hint={USERNAME_HINT}>
          <Input autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={30} value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }))} />
        </Field>
        <Field
          label="Email"
          required={emailRequired}
          hint={emailRequired
            ? 'Riceverai un link per confermare l’account.'
            : 'Facoltativa. Con l’email puoi accedere anche con quella e recuperare la password in autonomia. Sarà comunque richiesta al primo ordine.'}
        ><Input type="email" autoComplete="email" value={form.email} onChange={set('email')} /></Field>
        <Field label="Telefono" hint="Facoltativo. Sarà richiesto al primo ordine."><Input type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} maxLength={40} /></Field>
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
