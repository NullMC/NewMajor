import { useState, type FormEvent } from 'react'
import { CheckCircle2, MapPin, Phone, Mail, Building2 } from 'lucide-react'
import { useMeta } from '@/hooks/useMeta'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, FormError, Input, Textarea } from '@/components/ui/Form'
import { useAuth } from '@/features/auth/AuthProvider'
import { useSettings } from '@/features/settings/SettingsProvider'
import { Link, useSearchParams } from 'react-router-dom'
import { sendContactRequest } from './api'

const tel = (n: string) => `tel:${n.replace(/[^\d+]/g, '')}`

export default function ContactPage() {
  const { settings } = useSettings()
  const { user, profile } = useAuth()
  const c = settings.company
  const [params] = useSearchParams()
  const [form, setForm] = useState({
    name: profile?.full_name ?? '',
    email: profile?.email ?? user?.email ?? '',
    phone: profile?.phone ?? '',
    subject: (params.get('oggetto') ?? '').slice(0, 160), // es. dal pulsante "Richiedi una consulenza" della home
    message: '',
    website: '', // honeypot anti-spam
  })
  const [privacy, setPrivacy] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useMeta({ title: 'Contattaci', description: `Contatta ${c.name}: ${c.legal_address} · Tel. ${c.phone}` })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (form.website) return setSent(true)
    if (form.message.trim().length < 5) return setError('Scrivi un messaggio di almeno 5 caratteri.')
    if (!privacy) return setError('Per inviare la richiesta è necessario prendere visione dell’informativa privacy.')
    setSending(true)
    try {
      await sendContactRequest({ ...form, user_id: user?.id ?? null })
      setSent(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="container py-12 sm:py-16">
      <h1 className="display-lg text-4xl sm:text-5xl">Contattaci</h1>
      <p className="mt-3 max-w-xl text-ink-500">Per informazioni, preventivi e richieste su misura scrivici o chiamaci.</p>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <aside className="space-y-4">
          <div className="surface space-y-5 p-6">
            <div className="flex gap-3">
              <Phone className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" aria-hidden />
              <div>
                <p className="text-sm text-ink-500">Info e ordini</p>
                <a href={tel(c.phone)} className="text-lg font-semibold hover:text-gold-700">{c.phone}</a>
                {c.phone_alt && <a href={tel(c.phone_alt)} className="block font-medium text-ink-700 hover:text-gold-700">{c.phone_alt}</a>}
              </div>
            </div>
            {c.email && (
              <div className="flex gap-3">
                <Mail className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" aria-hidden />
                <div>
                  <p className="text-sm text-ink-500">Email</p>
                  <a href={`mailto:${c.email}`} className="break-all font-medium hover:text-gold-700">{c.email}</a>
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" aria-hidden />
              <div>
                <p className="text-sm text-ink-500">Sede legale</p>
                <p className="font-medium">{c.legal_address}</p>
                {c.show_alt_address && c.alt_address && <p className="text-sm text-ink-500">{c.alt_address}</p>}
              </div>
            </div>
            <div className="flex gap-3">
              <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" aria-hidden />
              <div className="text-sm">
                <p className="font-medium">{c.name}</p>
                <p className="text-ink-500">P. IVA {c.vat_number} · REA {c.rea}</p>
              </div>
            </div>
          </div>
        </aside>

        <div className="surface p-6 sm:p-8">
          {sent ? (
            <div className="flex flex-col items-center py-10 text-center" role="status">
              <CheckCircle2 className="h-12 w-12 text-success-600" aria-hidden />
              <h2 className="mt-4 text-xl font-bold">Richiesta inviata</h2>
              <p className="mt-2 max-w-sm text-ink-500">Grazie, ti ricontatteremo al più presto.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5" noValidate>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Nome e cognome" required><Input value={form.name} onChange={set('name')} autoComplete="name" maxLength={120} /></Field>
                <Field label="Email" required><Input type="email" value={form.email} onChange={set('email')} autoComplete="email" maxLength={254} /></Field>
                <Field label="Telefono"><Input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" maxLength={40} /></Field>
                <Field label="Oggetto"><Input value={form.subject} onChange={set('subject')} maxLength={160} /></Field>
              </div>
              <Field label="Messaggio" required><Textarea rows={6} value={form.message} onChange={set('message')} maxLength={5000} /></Field>
              <div className="hidden" aria-hidden>
                <label>Sito web<input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} /></label>
              </div>
              <Checkbox
                checked={privacy}
                onChange={(e) => setPrivacy(e.target.checked)}
                label={<>Ho letto l’<Link to="/privacy-policy" className="underline underline-offset-4">informativa privacy</Link></>}
              />
              <FormError message={error} />
              <Button type="submit" size="lg" loading={sending}>Invia richiesta</Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
