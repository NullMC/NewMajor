import { useEffect, useState, type FormEvent } from 'react'
import { CheckCircle2, MapPin, Phone, Mail, Building2, Minus, Plus } from 'lucide-react'
import { useMeta } from '@/hooks/useMeta'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, FormError, Input, Select, Textarea } from '@/components/ui/Form'
import { useQuery } from '@/hooks/useQuery'
import { publicUrl } from '@/lib/storage'
import { getProductBySlug, primaryImage } from '@/features/catalog/api'
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
  // Consulenza per un articolo non configurabile (pulsante della pagina prodotto)
  const productSlug = params.get('prodotto')
  const { data: product } = useQuery(productSlug ? `product:${productSlug}` : null, () => getProductBySlug(productSlug!))
  const variants = (product?.product_variants ?? []).filter((v) => v.is_active)
  const [variantId, setVariantId] = useState<string | null>(params.get('colore'))
  const variant = variants.find((v) => v.id === variantId) ?? variants[0] ?? null
  const [sizes, setSizes] = useState<Record<string, number>>({})
  const [pieces, setPieces] = useState(0)
  const total = product?.sizes.length ? Object.values(sizes).reduce((a, b) => a + b, 0) : pieces
  const [form, setForm] = useState({
    name: profile?.full_name ?? '',
    email: profile?.email ?? user?.email ?? '',
    phone: profile?.phone ?? '',
    subject: (params.get('oggetto') ?? '').slice(0, 160), // es. dal pulsante "Richiedi una consulenza" della home
    message: '',
    website: '', // honeypot anti-spam
  })
  // consulenza: oggetto precompilato con il nome dell'articolo (se il cliente non ne ha scritto uno)
  useEffect(() => {
    if (product) setForm((f) => (f.subject ? f : { ...f, subject: `Consulenza: ${product.name}`.slice(0, 160) }))
  }, [product])
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
      // consulenza: prodotto, colore e taglie vengono scritti in testa al messaggio
      const details = product
        ? [
            'Richiesta di consulenza',
            `Prodotto: ${product.name} (${window.location.origin}/prodotti/${product.slug})`,
            variant ? `Colore: ${variant.name}` : null,
            product.sizes.length
              ? `Taglie: ${Object.entries(sizes).filter(([, n]) => n > 0).map(([sz, n]) => `${sz} × ${n}`).join(', ') || 'da definire'}`
              : `Pezzi: ${pieces || 'da definire'}`,
            total ? `Totale pezzi: ${total}` : null,
            '',
            '',
          ].filter((l) => l !== null).join('\n')
        : ''
      const subject = form.subject || (product ? `Consulenza: ${product.name}`.slice(0, 160) : '')
      await sendContactRequest({ ...form, subject, message: (details + form.message).slice(0, 5000), user_id: user?.id ?? null })
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
              {product && (
                <fieldset className="rounded-2xl border border-ink-200 p-4">
                  <legend className="px-1 text-sm font-semibold text-ink-900">Consulenza per questo articolo</legend>
                  <div className="flex items-center gap-3">
                    {primaryImage(product) && (
                      <img src={publicUrl(primaryImage(product)!.storage_path) ?? ''} alt="" className="h-16 w-14 shrink-0 rounded-lg bg-ink-100 object-cover" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{product.name}</p>
                      <p className="text-xs text-ink-500">Colore e taglie vengono aggiunti alla richiesta.</p>
                    </div>
                  </div>
                  {variants.length > 0 && (
                    <Field label="Colore" className="mt-4">
                      <Select value={variant?.id ?? ''} onChange={(e) => setVariantId(e.target.value)}>
                        {variants.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </Select>
                    </Field>
                  )}
                  {product.sizes.length > 0 ? (
                    <div className="mt-4">
                      <p className="text-sm font-medium text-ink-800">Taglie e quantità</p>
                      <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {product.sizes.map((sz) => (
                          <li key={sz} className="flex items-center justify-between rounded-xl px-3 py-1.5 ring-1 ring-ink-200">
                            <span className="font-mono text-sm">{sz}</span>
                            <Qty value={sizes[sz] ?? 0} label={sz} onChange={(f) => setSizes((s) => ({ ...s, [sz]: f(s[sz] ?? 0) }))} />
                          </li>
                        ))}
                      </ul>
                      {total > 0 && <p className="mt-2 text-xs text-ink-500">Totale: {total} {total === 1 ? 'pezzo' : 'pezzi'}</p>}
                    </div>
                  ) : (
                    <div className="mt-4 flex items-center justify-between rounded-xl px-3 py-1.5 ring-1 ring-ink-200 sm:w-56">
                      <span className="text-sm">Pezzi</span>
                      <Qty value={pieces} label="pezzi" onChange={(f) => setPieces((p) => f(p))} />
                    </div>
                  )}
                </fieldset>
              )}
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Nome e cognome" required><Input value={form.name} onChange={set('name')} autoComplete="name" maxLength={120} /></Field>
                <Field label="Email" required><Input type="email" value={form.email} onChange={set('email')} autoComplete="email" maxLength={254} /></Field>
                <Field label="Telefono"><Input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" maxLength={40} /></Field>
                <Field label="Oggetto"><Input value={form.subject} onChange={set('subject')} maxLength={160} /></Field>
              </div>
              <Field label="Messaggio" required>
                <Textarea rows={6} value={form.message} onChange={set('message')} maxLength={4500} placeholder={product ? 'Descrivi la lavorazione o la personalizzazione che ti serve' : undefined} />
              </Field>
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

/** Selettore di quantità compatto (0–999). */
function Qty({ value, onChange, label }: { value: number; onChange: (update: (n: number) => number) => void; label: string }) {
  const clamp = (n: number) => Math.max(0, Math.min(999, Math.round(n) || 0))
  const set = (n: number) => onChange(() => clamp(n))
  const step = (d: number) => onChange((n) => clamp(n + d))
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => step(-1)} disabled={value <= 0} className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100 disabled:opacity-40" aria-label={`Meno ${label}`}><Minus className="h-3.5 w-3.5" /></button>
      <input inputMode="numeric" value={value} onChange={(e) => set(Number(e.target.value.replace(/\D/g, '')))} className="h-7 w-10 rounded-md bg-transparent text-center font-mono text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-gold-500" aria-label={`Quantità ${label}`} />
      <button type="button" onClick={() => step(1)} className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100" aria-label={`Più ${label}`}><Plus className="h-3.5 w-3.5" /></button>
    </div>
  )
}
