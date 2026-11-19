import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Package, PencilRuler, Plus, Search, Trash2, X } from 'lucide-react'
import type { AddressInput, OrderKind, PaymentMethod, ProductDetail, Profile } from '@/types/db'
import type { Configuration, CustomArea } from '@/types/config'
import { emptyConfiguration } from '@/types/config'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { formatPrice } from '@/lib/format'
import { uid } from '@/lib/slug'
import { uploadCustomerFile, UPLOADS_BUCKET } from '@/lib/storage'
import { readImageInfo, ACCEPTED_GRAPHIC_TYPES } from '@/lib/imageQuality'
import { invalidate, useQuery } from '@/hooks/useQuery'
import { useDebounce } from '@/hooks/useDebounce'
import { useMeta } from '@/hooks/useMeta'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, PageHeader } from '@/components/ui/Display'
import { Field, FormError, Input, Select, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Overlay'
import { useUi } from '@/components/ui/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { useSettings } from '@/features/settings/SettingsProvider'
import { listLibraryAssets } from '@/features/catalog/api'
import { listStatuses } from '@/features/orders/api'
import { emptyAddress, toSnapshot } from '@/features/account/api'
import { AddressFields } from '@/features/account/AddressForm'
import { useConfigurator } from '@/features/configurator/useConfigurator'
import { ConfiguratorViewer } from '@/features/configurator/ConfiguratorViewer'
import { ColorSection, GarmentSection, OptionsSection, TextStyleSection } from '@/features/configurator/sections/BasicSections'
import { GraphicsSection } from '@/features/configurator/sections/GraphicsSection'
import { RosterSection } from '@/features/configurator/sections/RosterSection'
import { storePreviews } from '@/features/cart/assets'
import { adminGetProduct, adminListProducts } from '../catalog/api'

interface DraftItem {
  key: string
  product_id: string | null
  product_name: string
  configuration: Configuration
  quantity: number
  unit_price: number
}

/** Configuratore interno: stessi strumenti del cliente, con prezzo modificabile. */
function AdminItemConfigurator({ product, onAdd, onCancel }: { product: ProductDetail; onAdd: (item: DraftItem) => void; onCancel: () => void }) {
  const { user } = useAuth()
  const { settings } = useSettings()
  const { data: library } = useQuery('assets:library', listLibraryAssets)
  const api = useConfigurator(product, { userId: user?.id ?? null, quality: settings.quality })
  const [unit, setUnit] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const suggested = api.qty ? Math.round((api.price.total / api.qty) * 100) / 100 : api.price.unit

  const add = async () => {
    setBusy(true)
    try {
      const blobs = await api.renderPreviews()
      const { preview } = await storePreviews(blobs, user?.id ?? null)
      onAdd({
        key: uid(), product_id: product.id, product_name: product.name, configuration: { ...api.config, preview },
        quantity: api.qty, unit_price: unit === '' ? suggested : Number(unit),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="h-[50vh] lg:sticky lg:top-0 lg:h-[70vh]"><ConfiguratorViewer api={api} /></div>
      <div className="space-y-6">
        <GarmentSection api={api} />
        <ColorSection api={api} />
        <OptionsSection api={api} />
        <GraphicsSection api={api} library={library ?? []} />
        <RosterSection api={api} />
        <TextStyleSection api={api} />
        {api.issues.length > 0 && (
          <ul className="rounded-xl bg-warning-50 p-3 text-xs text-warning-700">
            {api.issues.map((i) => <li key={i.message}>• {i.message}</li>)}
          </ul>
        )}
        <div className="surface space-y-3 p-4">
          <p className="text-sm">Prezzo di listino calcolato: <strong>{formatPrice(suggested)}</strong> / capo · totale {formatPrice(api.price.total)}</p>
          <Field label="Prezzo unitario applicato (€)" hint="Lascia vuoto per usare il prezzo calcolato">
            <Input type="number" step="0.01" min={0} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder={String(suggested)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onCancel}>Annulla</Button>
            <Button loading={busy} onClick={() => void add()}>Aggiungi all’ordine</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Articolo libero, non presente a catalogo. */
function CustomItemForm({ onAdd, onCancel }: { onAdd: (item: DraftItem) => void; onCancel: () => void }) {
  const { user } = useAuth()
  const { toast } = useUi()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [unit, setUnit] = useState('0')
  const [qty, setQty] = useState('1')
  const [baseColor, setBaseColor] = useState('#FFFFFF')
  const [areas, setAreas] = useState<CustomArea[]>([])
  const [rosterText, setRosterText] = useState('')
  const [uploading, setUploading] = useState<number | null>(null)

  const upload = async (i: number, file: File) => {
    if (!user) return
    setUploading(i)
    try {
      const info = await readImageInfo(file)
      const path = await uploadCustomerFile(user.id, file, info.mime, 'graphics')
      setAreas((a) => a.map((x, j) => (j === i ? {
        ...x,
        asset: {
          bucket: UPLOADS_BUCKET, path, name: file.name, mime: info.mime, width: info.width, height: info.height, sizeBytes: info.sizeBytes,
          isVector: info.isVector, effectiveDpi: null, metadataDpi: info.metadataDpi, quality: info.isVector ? 'vector' : 'ok',
        },
      } : x)))
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setUploading(null)
    }
  }

  const add = () => {
    if (!name.trim()) return toast('Inserisci il nome dell’articolo', 'error')
    const roster = rosterText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const [n = '', num = '', size = '', q = ''] = l.split(/\t|;|,/).map((s) => s.trim())
      return { id: uid(), name: n.slice(0, 40), number: num.replace(/\D/g, '').slice(0, 4), size: size || undefined, quantity: Math.max(1, Number(q) || 1) }
    })
    const config: Configuration = { ...emptyConfiguration(), baseColor, customAreas: areas, roster, customDescription: description.trim() || undefined }
    onAdd({ key: uid(), product_id: null, product_name: name.trim(), configuration: config, quantity: roster.length ? roster.reduce((s, r) => s + r.quantity, 0) : Math.max(1, Number(qty) || 1), unit_price: Math.max(0, Number(unit) || 0) })
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome articolo" required><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={160} /></Field>
        <Field label="Colore base"><div className="flex gap-2"><input type="color" value={baseColor} onChange={(e) => setBaseColor(e.target.value.toUpperCase())} className="h-11 w-14 rounded-xl border border-ink-200 p-1" aria-label="Colore base" /><Input value={baseColor} onChange={(e) => setBaseColor(e.target.value)} /></div></Field>
        <Field label="Prezzo unitario (€)" required><Input type="number" step="0.01" min={0} value={unit} onChange={(e) => setUnit(e.target.value)} /></Field>
        <Field label="Quantità" hint="Ignorata se compili l’elenco giocatori"><Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field label="Descrizione / specifiche di produzione" className="sm:col-span-2"><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} /></Field>
      </div>
      <div className="space-y-3">
        <p className="text-sm font-semibold">Personalizzazioni</p>
        {areas.map((a, i) => (
          <div key={i} className="grid gap-2 rounded-xl border border-ink-200 p-3 sm:grid-cols-[1fr_9rem_8rem_auto]">
            <Input value={a.name} onChange={(e) => setAreas(areas.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Nome area" aria-label="Nome area" />
            <Select value={a.type} onChange={(e) => setAreas(areas.map((x, j) => (j === i ? { ...x, type: e.target.value as CustomArea['type'] } : x)))} aria-label="Tipo">
              <option value="logo">Logo</option><option value="sponsor">Sponsor</option><option value="all_over">All-over</option><option value="text">Testo</option><option value="number">Numero</option>
            </Select>
            <Select value={a.side} onChange={(e) => setAreas(areas.map((x, j) => (j === i ? { ...x, side: e.target.value as 'front' | 'back' } : x)))} aria-label="Lato">
              <option value="front">Fronte</option><option value="back">Retro</option>
            </Select>
            <button type="button" onClick={() => setAreas(areas.filter((_, j) => j !== i))} className="rounded-lg p-2 text-ink-400 hover:text-danger-600" aria-label="Rimuovi area"><X className="h-4 w-4" /></button>
            <Input value={a.note ?? ''} onChange={(e) => setAreas(areas.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} placeholder="Note (posizione, colori…)" className="sm:col-span-3" aria-label="Note area" />
            <label className="inline-flex h-11 cursor-pointer items-center justify-center rounded-xl border border-ink-200 px-3 text-xs font-semibold hover:border-ink-400">
              {uploading === i ? 'Caricamento…' : a.asset ? 'File caricato ✓' : 'Carica file'}
              <input type="file" accept={ACCEPTED_GRAPHIC_TYPES.join(',')} className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(i, f); e.target.value = '' }} />
            </label>
          </div>
        ))}
        <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAreas([...areas, { name: '', type: 'logo', side: 'front' }])}>Aggiungi personalizzazione</Button>
      </div>
      <Field label="Elenco giocatori (facoltativo)" hint="Una riga per capo: Nome; Numero; Taglia; Quantità">
        <Textarea rows={5} value={rosterText} onChange={(e) => setRosterText(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Annulla</Button>
        <Button onClick={add}>Aggiungi all’ordine</Button>
      </div>
    </div>
  )
}

export default function ManualOrderPage() {
  useMeta({ title: 'Nuovo ordine manuale', noindex: true })
  const navigate = useNavigate()
  const { settings } = useSettings()
  const { data: statuses } = useQuery('order-statuses', listStatuses)
  const { data: products } = useQuery('admin:products:active', () => adminListProducts(false))
  const [kind, setKind] = useState<OrderKind>('quote')
  const [payment, setPayment] = useState<PaymentMethod>('bank_transfer')
  const [statusId, setStatusId] = useState('')
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '' })
  const [user, setUser] = useState<Profile | null>(null)
  const [userSearch, setUserSearch] = useState('')
  const debounced = useDebounce(userSearch.trim(), 300)
  const { data: userResults } = useQuery(debounced.length >= 2 ? `admin:user-search:${debounced}` : null, async () => {
    const s = debounced.replace(/[,()%*\\]/g, ' ')
    const { data, error } = await supabase.from('profiles').select('*').or(`username.ilike.%${s}%,email.ilike.%${s}%,full_name.ilike.%${s}%,phone.ilike.%${s}%`).limit(8)
    if (error) throw error
    return data as Profile[]
  })
  const [address, setAddress] = useState<AddressInput>(emptyAddress())
  const [shipping, setShipping] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<DraftItem[]>([])
  const [configuring, setConfiguring] = useState<ProductDetail | null>(null)
  const [pickProduct, setPickProduct] = useState('')
  const [customOpen, setCustomOpen] = useState(false)
  const [loadingProduct, setLoadingProduct] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectUser = async (p: Profile) => {
    setUser(p)
    setUserSearch('')
    setCustomer({ name: p.full_name ?? '', email: p.email ?? '', phone: p.phone ?? '' })
    const { data } = await supabase.from('addresses').select('*').eq('user_id', p.id).order('is_default_shipping', { ascending: false }).limit(1)
    if (data?.[0]) setAddress({ ...data[0] })
    else setAddress({ ...emptyAddress(), full_name: p.full_name ?? '', phone: p.phone ?? '' })
  }

  const openConfigurator = async () => {
    if (!pickProduct) return
    setLoadingProduct(true)
    try {
      const p = await adminGetProduct(pickProduct)
      if (p) setConfiguring(p)
    } finally {
      setLoadingProduct(false)
    }
  }

  const subtotal = items.reduce((s, i) => s + i.unit_price * i.quantity, 0)

  const submit = async () => {
    setError(null)
    if (!customer.name.trim()) return setError('Inserisci il nome del cliente.')
    if (!items.length) return setError('Aggiungi almeno un articolo.')
    setSaving(true)
    try {
      const { data, error: e } = await supabase.rpc('admin_create_order', {
        p_payload: {
          user_id: user?.id ?? null,
          kind,
          payment_method: payment,
          status_id: statusId || null,
          customer: { name: customer.name.trim(), email: customer.email.trim(), phone: customer.phone.trim() },
          shipping_address: toSnapshot(address),
          notes,
          shipping_cost: shipping === '' ? null : Number(shipping),
          items: items.map(({ key: _k, ...i }) => i),
        },
      })
      if (e) throw e
      const row = (Array.isArray(data) ? data[0] : data) as { order_id: string; reference: string }
      invalidate('admin:orders')
      navigate(`/admin/ordini/${row.order_id}`)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <Link to="/admin/ordini" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-900"><ArrowLeft className="h-4 w-4" /> Ordini</Link>
      <PageHeader title="Ordine, preventivo o test manuale" description="Per richieste private: configura prodotti del catalogo o articoli su misura e applica prezzi personalizzati." />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Cliente" description="Collega un utente registrato per mostrargli l’ordine nell’area personale, oppure inserisci i dati manualmente." />
            <div className="space-y-4 p-5">
              {user ? (
                <div className="flex items-center justify-between rounded-xl bg-ink-50 p-3 text-sm">
                  <span><strong>{user.full_name ?? user.username ?? user.email}</strong> · {user.email ?? `@${user.username}`}</span>
                  <button type="button" onClick={() => setUser(null)} className="rounded-lg p-1.5 hover:bg-white" aria-label="Scollega utente"><X className="h-4 w-4" /></button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-ink-400" aria-hidden />
                  <Input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Cerca utente registrato (email, nome, telefono)" className="pl-10" aria-label="Cerca utente" />
                  {!!userResults?.length && userSearch && (
                    <ul className="absolute inset-x-0 top-12 z-10 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-pop">
                      {userResults.map((p) => (
                        <li key={p.id}><button type="button" onClick={() => void selectUser(p)} className="w-full px-4 py-2.5 text-left text-sm hover:bg-ink-50"><strong>{p.full_name ?? '—'}</strong> · {p.email ?? `@${p.username}`}</button></li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Nome cliente" required><Input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} /></Field>
                <Field label="Email"><Input type="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} /></Field>
                <Field label="Telefono"><Input type="tel" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} /></Field>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Articoli" />
            <div className="space-y-4 p-5">
              {items.map((it) => (
                <div key={it.key} className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-200 p-3">
                  <Package className="h-5 w-5 text-ink-400" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{it.product_name}</p>
                    <p className="text-xs text-ink-500">{it.product_id ? 'Da catalogo' : 'Articolo su misura'} · {it.quantity} pz</p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-ink-500">€/pz
                    <Input type="number" step="0.01" min={0} value={it.unit_price} onChange={(e) => setItems(items.map((x) => (x.key === it.key ? { ...x, unit_price: Math.max(0, Number(e.target.value) || 0) } : x)))} className="h-9 w-24 text-sm" aria-label={`Prezzo ${it.product_name}`} />
                  </label>
                  <span className="w-24 text-right text-sm font-semibold">{formatPrice(it.unit_price * it.quantity)}</span>
                  <button type="button" onClick={() => setItems(items.filter((x) => x.key !== it.key))} className="rounded-lg p-2 text-ink-400 hover:text-danger-600" aria-label="Rimuovi articolo"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Select value={pickProduct} onChange={(e) => setPickProduct(e.target.value)} className="max-w-sm" aria-label="Prodotto da configurare">
                  <option value="">Prodotto dal catalogo (anche non pubblicato)…</option>
                  {(products ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.is_published ? '' : ' (bozza)'}</option>)}
                </Select>
                <Button variant="secondary" icon={<PencilRuler className="h-4 w-4" />} disabled={!pickProduct} loading={loadingProduct} onClick={() => void openConfigurator()}>Configura</Button>
                <Button variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setCustomOpen(true)}>Articolo su misura</Button>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Spedizione" />
            <div className="p-5"><AddressFields value={address} onChange={setAddress} /></div>
          </Card>
        </div>

        <div className="space-y-6 xl:sticky xl:top-20 xl:self-start">
          <Card className="space-y-4 p-5">
            <Field label="Tipo">
              <Select value={kind} onChange={(e) => setKind(e.target.value as OrderKind)}>
                <option value="quote">Preventivo</option>
                <option value="order">Ordine</option>
                <option value="test">Ordine di test (non notifica il cliente)</option>
              </Select>
            </Field>
            <Field label="Pagamento">
              <Select value={payment} onChange={(e) => setPayment(e.target.value as PaymentMethod)}>
                <option value="bank_transfer">Bonifico bancario</option>
                <option value="cash_on_delivery">Pagamento alla consegna</option>
              </Select>
            </Field>
            <Field label="Stato iniziale">
              <Select value={statusId} onChange={(e) => setStatusId(e.target.value)}>
                <option value="">Predefinito</option>
                {(statuses ?? []).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </Select>
            </Field>
            <Field label="Spedizione (€)" hint={settings.shipping.mode === 'quote' ? 'Vuoto = da definire' : undefined}>
              <Input type="number" step="0.01" min={0} value={shipping} onChange={(e) => setShipping(e.target.value)} />
            </Field>
            <Field label="Note"><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} /></Field>
            <dl className="space-y-1 border-t border-ink-100 pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-ink-500">Subtotale</dt><dd>{formatPrice(subtotal)}</dd></div>
              <div className="flex justify-between font-semibold"><dt>Totale</dt><dd>{formatPrice(subtotal + (Number(shipping) || 0))}</dd></div>
            </dl>
            <FormError message={error} />
            <Button className="w-full" loading={saving} onClick={() => void submit()}>Crea {kind === 'quote' ? 'preventivo' : kind === 'test' ? 'ordine di test' : 'ordine'}</Button>
          </Card>
        </div>
      </div>

      <Modal open={!!configuring} onClose={() => setConfiguring(null)} title={configuring ? `Configura: ${configuring.name}` : ''} size="xl">
        {configuring && (
          <AdminItemConfigurator
            key={configuring.id}
            product={configuring}
            onCancel={() => setConfiguring(null)}
            onAdd={(it) => { setItems((x) => [...x, it]); setConfiguring(null) }}
          />
        )}
      </Modal>
      <Modal open={customOpen} onClose={() => setCustomOpen(false)} title="Articolo su misura" size="lg">
        <CustomItemForm onCancel={() => setCustomOpen(false)} onAdd={(it) => { setItems((x) => [...x, it]); setCustomOpen(false) }} />
      </Modal>
    </div>
  )
}
