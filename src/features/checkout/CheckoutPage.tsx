import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Banknote, Landmark, Plus } from 'lucide-react'
import type { AddressInput, AddressSnapshot, PaymentMethod } from '@/types/db'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/format'
import { errorMessage } from '@/lib/errors'
import { configQuantity } from '@/lib/pricing'
import { invalidate, useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, FormError, Input, Textarea } from '@/components/ui/Form'
import { PageLoader } from '@/components/ui/Spinner'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCart } from '@/features/cart/CartProvider'
import { hasPendingAssets } from '@/features/cart/assets'
import { ShippingNote, useCartDetails } from '@/features/cart/CartPage'
import { useSettings } from '@/features/settings/SettingsProvider'
import { emptyAddress, listAddresses, saveAddress, toSnapshot, validateAddress } from '@/features/account/api'
import { AddressFields } from '@/features/account/AddressForm'
import { placeOrder } from '@/features/orders/api'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="surface p-5 sm:p-6">
      <h2 className="mb-5 font-sans text-base font-semibold" style={{ fontStretch: '100%' }}>{title}</h2>
      {children}
    </section>
  )
}

export default function CheckoutPage() {
  const { user, profile } = useAuth()
  const cart = useCart()
  const { settings } = useSettings()
  const navigate = useNavigate()
  const { rows, subtotal, loading } = useCartDetails(cart.lines)
  const { data: addresses, loading: addrLoading } = useQuery(user ? `addresses:${user.id}` : null, listAddresses)
  useMeta({ title: 'Checkout', noindex: true })

  const [customer, setCustomer] = useState({ name: '', phone: '' })
  const [addressId, setAddressId] = useState<string | 'new'>('new')
  const [newAddress, setNewAddress] = useState<AddressInput>(emptyAddress())
  const [saveNew, setSaveNew] = useState(true)
  const [invoice, setInvoice] = useState(false)
  const [billing, setBilling] = useState({ company: '', vat_number: '', fiscal_code: '', sameAsShipping: true })
  const [billingAddress, setBillingAddress] = useState<AddressInput>(emptyAddress())
  const enabledMethods = (['cash_on_delivery', 'bank_transfer'] as PaymentMethod[]).filter((m) => settings.payments[m]?.enabled !== false)
  const [method, setMethod] = useState<PaymentMethod>(enabledMethods[0] ?? 'bank_transfer')
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (profile) {
      setCustomer((c) => ({ name: c.name || profile.full_name || '', phone: c.phone || profile.phone || '' }))
      setBilling((b) => ({ ...b, company: b.company || profile.company_name || '', vat_number: b.vat_number || profile.vat_number || '', fiscal_code: b.fiscal_code || profile.fiscal_code || '' }))
      setNewAddress((a) => ({ ...a, full_name: a.full_name || profile.full_name || '', phone: a.phone || profile.phone || '' }))
    }
  }, [profile])
  useEffect(() => {
    if (addresses?.length && addressId === 'new') setAddressId((addresses.find((a) => a.is_default_shipping) ?? addresses[0]).id)
  }, [addresses]) // eslint-disable-line react-hooks/exhaustive-deps

  if (cart.loading || cart.syncing || addrLoading) return <PageLoader />
  if (!cart.lines.length) return <Navigate to="/carrello" replace />

  const shipping = settings.shipping
  const shippingCost = shipping.mode === 'flat' && shipping.amount !== null ? (shipping.free_over !== null && subtotal >= shipping.free_over ? 0 : shipping.amount) : 0

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!customer.name.trim()) return setError('Inserisci il tuo nome.')
    if (!customer.phone.trim()) return setError('Inserisci un numero di telefono per le comunicazioni sull’ordine.')
    let ship: AddressSnapshot
    if (addressId === 'new') {
      const err = validateAddress(newAddress)
      if (err) return setError(err)
      ship = toSnapshot(newAddress)
    } else {
      const a = addresses?.find((x) => x.id === addressId)
      if (!a) return setError('Seleziona un indirizzo di spedizione.')
      ship = toSnapshot(a)
    }
    let bill: AddressSnapshot | null = null
    if (invoice) {
      if (!billing.vat_number.trim() && !billing.fiscal_code.trim()) return setError('Per la fattura indica Partita IVA o Codice Fiscale.')
      const base = billing.sameAsShipping ? ship : toSnapshot(billingAddress)
      if (!billing.sameAsShipping) {
        const err = validateAddress(billingAddress)
        if (err) return setError(`Fatturazione: ${err}`)
      }
      bill = { ...base, company: billing.company.trim() || base.company, vat_number: billing.vat_number.trim() || null, fiscal_code: billing.fiscal_code.trim() || null }
    }
    if (!terms) return setError('Accetta i termini e condizioni per procedere.')
    if (cart.lines.some((l) => hasPendingAssets(l.configuration))) return setError('Alcune grafiche non sono state caricate. Ricarica la pagina e riprova.')

    setSubmitting(true)
    try {
      if (addressId === 'new' && saveNew && user) {
        await saveAddress(user.id, { ...newAddress, is_default_shipping: !addresses?.length }).catch(() => undefined)
        invalidate(`addresses:${user.id}`)
      }
      const res = await placeOrder({
        paymentMethod: method,
        shipping: ship,
        billing: bill,
        customer: { name: customer.name.trim(), email: profile?.email ?? user?.email ?? '', phone: customer.phone.trim() },
        notes,
      })
      await cart.reload()
      invalidate('orders:')
      navigate(`/ordine-confermato/${res.order_id}`, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="container py-10 sm:py-14" noValidate>
      <h1 className="display-lg text-4xl">Completa l’ordine</h1>
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <Section title="I tuoi dati">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome e cognome" required><Input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} autoComplete="name" /></Field>
              <Field label="Telefono" required><Input type="tel" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} autoComplete="tel" /></Field>
              <Field label="Email" className="sm:col-span-2" hint="L’email del tuo account"><Input value={profile?.email ?? user?.email ?? ''} readOnly disabled /></Field>
            </div>
          </Section>

          <Section title="Spedizione">
            {!!addresses?.length && (
              <div role="radiogroup" aria-label="Indirizzo di spedizione" className="mb-5 grid gap-2 sm:grid-cols-2">
                {addresses.map((a) => (
                  <label key={a.id} className={cn('flex cursor-pointer gap-3 rounded-xl border p-4 text-sm', addressId === a.id ? 'border-ink-900 bg-ink-50' : 'border-ink-200 hover:border-ink-400')}>
                    <input type="radio" name="addr" className="mt-1 accent-ink-900" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
                    <span>
                      <span className="font-semibold">{a.label || a.full_name}</span><br />
                      <span className="text-ink-600">{a.line1}, {a.postal_code} {a.city}</span>
                    </span>
                  </label>
                ))}
                <label className={cn('flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-sm font-semibold', addressId === 'new' ? 'border-ink-900 bg-ink-50' : 'border-dashed border-ink-300 hover:border-ink-500')}>
                  <input type="radio" name="addr" className="accent-ink-900" checked={addressId === 'new'} onChange={() => setAddressId('new')} />
                  <Plus className="h-4 w-4" aria-hidden /> Nuovo indirizzo
                </label>
              </div>
            )}
            {addressId === 'new' && (
              <div className="space-y-4">
                <AddressFields value={newAddress} onChange={setNewAddress} />
                <Checkbox label="Salva questo indirizzo per i prossimi ordini" checked={saveNew} onChange={(e) => setSaveNew(e.target.checked)} />
              </div>
            )}
            {settings.shipping.note && <p className="mt-4 text-sm text-ink-500">{settings.shipping.note}</p>}
          </Section>

          <Section title="Fatturazione">
            <Checkbox label="Richiedo la fattura" description="Per società, associazioni sportive o professionisti" checked={invoice} onChange={(e) => setInvoice(e.target.checked)} />
            {invoice && (
              <div className="mt-5 space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Ragione sociale"><Input value={billing.company} onChange={(e) => setBilling({ ...billing, company: e.target.value })} /></Field>
                  <Field label="Partita IVA"><Input value={billing.vat_number} onChange={(e) => setBilling({ ...billing, vat_number: e.target.value })} maxLength={32} /></Field>
                  <Field label="Codice fiscale"><Input value={billing.fiscal_code} onChange={(e) => setBilling({ ...billing, fiscal_code: e.target.value.toUpperCase() })} maxLength={32} /></Field>
                </div>
                <Checkbox label="Indirizzo di fatturazione uguale a quello di spedizione" checked={billing.sameAsShipping} onChange={(e) => setBilling({ ...billing, sameAsShipping: e.target.checked })} />
                {!billing.sameAsShipping && <AddressFields value={billingAddress} onChange={setBillingAddress} />}
              </div>
            )}
          </Section>

          <Section title="Pagamento">
            <div role="radiogroup" aria-label="Metodo di pagamento" className="grid gap-3 sm:grid-cols-2">
              {enabledMethods.map((m) => {
                const Icon = m === 'bank_transfer' ? Landmark : Banknote
                const note = settings.payments[m]?.note
                return (
                  <label key={m} className={cn('flex cursor-pointer gap-3 rounded-xl border p-4', method === m ? 'border-ink-900 bg-ink-50' : 'border-ink-200 hover:border-ink-400')}>
                    <input type="radio" name="pay" className="mt-1 accent-ink-900" checked={method === m} onChange={() => setMethod(m)} />
                    <span>
                      <span className="flex items-center gap-2 font-semibold"><Icon className="h-4 w-4" aria-hidden />{m === 'bank_transfer' ? 'Bonifico bancario' : 'Pagamento alla consegna'}</span>
                      <span className="mt-1 block text-sm text-ink-500">
                        {note || (m === 'bank_transfer' ? 'Riceverai le coordinate e la causale dopo l’invio dell’ordine.' : 'Paghi al momento della consegna.')}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          </Section>

          <Section title="Note per l’ordine">
            <Textarea rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Tempistiche, richieste particolari, riferimenti della squadra…" aria-label="Note per l'ordine" />
          </Section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="surface p-5">
            <h2 className="font-sans text-base font-semibold" style={{ fontStretch: '100%' }}>Il tuo ordine</h2>
            <ul className="mt-4 divide-y divide-ink-100 text-sm">
              {rows.map(({ line, product, price }) => (
                <li key={line.id} className="flex justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{product?.name ?? '…'}</span>
                    <span className="text-xs text-ink-500">{configQuantity(line.configuration, line.quantity)} pz</span>
                  </span>
                  <span className="shrink-0 font-medium">{price ? formatPrice(price.total) : '—'}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-2 border-t border-ink-200 pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-ink-500">Subtotale</dt><dd>{formatPrice(subtotal)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-500">Spedizione</dt><dd className="text-right"><ShippingNote /></dd></div>
              <div className="flex justify-between border-t border-ink-200 pt-3 text-base font-semibold"><dt>Totale</dt><dd>{formatPrice(subtotal + shippingCost)}</dd></div>
            </dl>
            <p className="mt-2 text-xs text-ink-500">Il totale definitivo viene calcolato dal sistema all’invio dell’ordine.</p>
            <div className="mt-5 space-y-4">
              <Checkbox
                checked={terms}
                onChange={(e) => setTerms(e.target.checked)}
                label={<>Accetto i <Link to="/termini-e-condizioni" target="_blank" className="underline underline-offset-4">termini e condizioni</Link> e la <Link to="/politica-rimborsi" target="_blank" className="underline underline-offset-4">politica di rimborso</Link></>}
              />
              <FormError message={error} />
              <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={loading}>Invia ordine</Button>
            </div>
          </div>
        </aside>
      </div>
    </form>
  )
}
