import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, ShoppingBag } from 'lucide-react'
import type { ProductDetail } from '@/types/db'
import type { Configuration } from '@/types/config'
import { formatPrice } from '@/lib/format'
import { errorMessage } from '@/lib/errors'
import { useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { Button, ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Display'
import { PageLoader } from '@/components/ui/Spinner'
import { Textarea } from '@/components/ui/Form'
import { useUi } from '@/components/ui/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCart } from '@/features/cart/CartProvider'
import { storePreviews } from '@/features/cart/assets'
import { useSettings } from '@/features/settings/SettingsProvider'
import { getProductBySlug, listLibraryAssets } from '@/features/catalog/api'
import { useConfigurator } from './useConfigurator'
import { ConfiguratorViewer } from './ConfiguratorViewer'
import { ColorSection, GarmentSection, OptionsSection, TextStyleSection } from './sections/BasicSections'
import { GraphicsSection } from './sections/GraphicsSection'
import { RosterSection } from './sections/RosterSection'

function Step({ n, title, children, issues }: { n: number; title: string; children: ReactNode; issues?: string[] }) {
  return (
    <section aria-labelledby={`step-${n}`} className="border-b border-ink-200 py-6 last:border-0">
      <h2 id={`step-${n}`} className="mb-4 flex items-center gap-3 font-sans text-base font-semibold" style={{ fontStretch: '100%' }}>
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-900 text-xs font-bold text-white">{n}</span>
        {title}
      </h2>
      {children}
      {!!issues?.length && (
        <ul className="mt-3 space-y-1">
          {issues.map((m) => <li key={m} className="flex gap-1.5 text-xs font-medium text-danger-600"><AlertCircle className="mt-0.5 h-3.5 w-3.5" aria-hidden />{m}</li>)}
        </ul>
      )}
    </section>
  )
}

function Configurator({ product, editLine }: { product: ProductDetail; editLine: { id: string; configuration: Configuration; quantity: number } | null }) {
  const { user } = useAuth()
  const { settings } = useSettings()
  const cart = useCart()
  const { toast } = useUi()
  const navigate = useNavigate()
  const { data: library } = useQuery('assets:library', listLibraryAssets, { staleMs: 5 * 60_000 })
  const api = useConfigurator(product, {
    initial: editLine?.configuration ?? null,
    initialQuantity: editLine?.quantity,
    userId: user?.id ?? null,
    quality: settings.quality,
  })
  const [submitting, setSubmitting] = useState(false)
  const [showIssues, setShowIssues] = useState(false)
  const [note, setNote] = useState(editLine?.configuration.customDescription ?? '')

  const issuesBy = (s: string) => (showIssues ? api.issues.filter((i) => i.section === s).map((i) => i.message) : [])

  const submit = async () => {
    if (api.issues.length) {
      setShowIssues(true)
      toast(api.issues[0].message, 'error')
      return
    }
    setSubmitting(true)
    try {
      const blobs = await api.renderPreviews()
      const { preview, pending } = await storePreviews(blobs, user?.id ?? null)
      const configuration: Configuration = { ...api.config, preview: preview ?? api.config.preview, customDescription: note.trim() || undefined }
      if (editLine) {
        await cart.update(editLine.id, configuration, api.qty)
        toast('Configurazione aggiornata')
      } else {
        await cart.add(product.id, configuration, api.qty, pending)
        toast('Prodotto aggiunto al carrello')
      }
      navigate('/carrello')
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  let n = 0
  const hasGraphics = api.areas.some((a) => ['logo', 'sponsor', 'all_over'].includes(a.area_type))

  return (
    <div className="container pb-32 pt-4 lg:pb-16">
      <Link to={`/prodotti/${product.slug}`} className="inline-flex items-center gap-1.5 rounded-lg py-2 text-sm font-medium text-ink-500 hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> {product.name}
      </Link>
      <div className="mt-2 grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-10">
        <div className="sticky top-16 z-10 -mx-4 h-[46vh] min-h-[300px] bg-ink-50 px-4 pb-2 sm:mx-0 sm:px-0 lg:top-20 lg:h-[calc(100dvh-7rem)]">
          <ConfiguratorViewer api={api} />
        </div>

        <div>
          <h1 className="display-lg text-2xl sm:text-3xl">{editLine ? 'Modifica configurazione' : product.is_configurable ? 'Personalizza' : 'Configura il tuo ordine'}</h1>
          <p className="mt-1 text-ink-500">{product.name}</p>

          {(product.product_garment_types?.length ?? 0) > 0 && (
            <Step n={++n} title="Tipologia di capo" issues={issuesBy('garment')}><GarmentSection api={api} /></Step>
          )}
          {product.product_variants.some((v) => v.is_active) && (
            <Step n={++n} title="Colore base" issues={issuesBy('color')}><ColorSection api={api} /></Step>
          )}
          {product.product_options.some((o) => (o.product_option_values ?? []).length) && (
            <Step n={++n} title="Opzioni" issues={issuesBy('options')}><OptionsSection api={api} /></Step>
          )}
          {hasGraphics && (
            <Step n={++n} title="Loghi, sponsor e grafiche" issues={issuesBy('graphics')}>
              <GraphicsSection api={api} library={library ?? []} />
            </Step>
          )}
          <Step n={++n} title={api.roster ? 'Nomi, numeri, taglie e quantità' : 'Quantità'} issues={issuesBy('roster')}>
            <RosterSection api={api} />
            <div className="mt-4"><TextStyleSection api={api} /></div>
          </Step>
          <Step n={++n} title="Riepilogo">
            <div className="space-y-4">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-ink-500">Prezzo base</dt><dd>{formatPrice(api.price.base)}</dd></div>
                {api.price.lines.map((l) => (
                  <div key={l.label} className="flex justify-between gap-4"><dt className="text-ink-500">{l.label}</dt><dd>{l.amount > 0 ? '+' : ''}{formatPrice(l.amount)}</dd></div>
                ))}
                <div className="flex justify-between border-t border-ink-200 pt-2"><dt className="text-ink-500">Prezzo unitario</dt><dd className="font-medium">{formatPrice(api.price.unit)}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">Quantità</dt><dd>{api.qty}</dd></div>
                {api.price.discountPercent > 0 && (
                  <div className="flex justify-between text-success-700"><dt>Sconto quantità</dt><dd>−{api.price.discountPercent}%</dd></div>
                )}
                <div className="flex justify-between border-t border-ink-200 pt-2 text-base font-semibold"><dt>Totale</dt><dd>{formatPrice(api.price.total)}</dd></div>
              </dl>
              {product.price_tiers.length > 0 && (
                <p className="text-xs text-ink-500">
                  Sconti quantità: {product.price_tiers.map((t) => `da ${t.min_quantity} pz −${Number(t.discount_percent)}%`).join(' · ')}
                </p>
              )}
              <label className="block">
                <span className="text-sm font-medium">Indicazioni per la produzione <span className="font-normal text-ink-500">(facoltative)</span></span>
                <Textarea className="mt-1.5" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Es. posizione particolare dello sponsor, colori Pantone…" />
              </label>
              <p className="text-xs text-ink-500">Il prezzo finale viene verificato al momento dell’ordine. L’anteprima è indicativa.</p>
            </div>
          </Step>
          <div className="hidden lg:block">
            <Button size="lg" className="w-full" loading={submitting} onClick={submit} icon={<ShoppingBag className="h-5 w-5" />}>
              {editLine ? 'Salva modifiche' : 'Aggiungi al carrello'} · {formatPrice(api.price.total)}
            </Button>
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 p-3 pb-safe backdrop-blur lg:hidden">
        <div className="container flex items-center gap-3 px-0">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-ink-500">{api.qty} {api.qty === 1 ? 'capo' : 'capi'}</p>
            <p className="text-lg font-bold leading-tight">{formatPrice(api.price.total)}</p>
          </div>
          <Button size="lg" loading={submitting} onClick={submit} icon={<ShoppingBag className="h-5 w-5" />}>
            {editLine ? 'Salva' : 'Aggiungi'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function ConfiguratorPage() {
  const { slug = '' } = useParams()
  const [params] = useSearchParams()
  const cart = useCart()
  const { data: product, loading, error } = useQuery(`product:${slug}`, () => getProductBySlug(slug))
  const lineId = params.get('riga')
  const editLine = useMemo(() => {
    const l = lineId ? cart.lines.find((x) => x.id === lineId) : null
    return l ? { id: l.id, configuration: l.configuration, quantity: l.quantity } : null
  }, [lineId, cart.lines])

  useMeta({ title: product ? `Personalizza ${product.name}` : 'Configuratore', noindex: !!lineId })

  if (loading || (lineId && cart.loading)) return <PageLoader />
  if (error || !product) {
    return (
      <div className="container py-16">
        <EmptyState title="Prodotto non trovato" description="Il prodotto potrebbe non essere più disponibile." action={<ButtonLink to="/catalogo">Vai al catalogo</ButtonLink>} />
      </div>
    )
  }
  return <Configurator key={editLine?.id ?? 'new'} product={product} editLine={editLine} />
}
