import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Pencil, ShoppingBag, Trash2 } from 'lucide-react'
import type { ProductDetail } from '@/types/db'
import { formatPrice } from '@/lib/format'
import { computePrice, configQuantity } from '@/lib/pricing'
import { errorMessage } from '@/lib/errors'
import { useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { Button, ButtonLink } from '@/components/ui/Button'
import { EmptyState, Skeleton } from '@/components/ui/Display'
import { useUi } from '@/components/ui/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { useSettings } from '@/features/settings/SettingsProvider'
import { getProductsByIds } from '@/features/catalog/api'
import { describeConfiguration, PreviewThumbs } from '@/features/orders/components'
import { useCart, type CartLine } from './CartProvider'

export function useCartDetails(lines: CartLine[]) {
  const ids = useMemo(() => [...new Set(lines.map((l) => l.productId))].sort(), [lines])
  const { data: products, loading } = useQuery(ids.length ? `cart:products:${ids.join(',')}` : null, () => getProductsByIds(ids))
  const byId = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products])
  const rows = lines.map((l) => {
    const product = byId.get(l.productId)
    const price = product ? computePrice(product, l.configuration, l.quantity) : null
    const unavailable = !!products && (!product || !product.is_published || !!product.deleted_at || product.availability === 'out_of_stock')
    return { line: l, product, price, unavailable }
  })
  const subtotal = rows.reduce((s, r) => s + (r.price?.total ?? 0), 0)
  return { rows, subtotal, loading: loading && !products }
}

export function ShippingNote() {
  const { settings } = useSettings()
  const s = settings.shipping
  if (s.mode === 'flat' && s.amount !== null) {
    return (
      <>
        {formatPrice(s.amount)}
        {s.free_over !== null && <span className="block text-xs text-ink-500">Gratuita sopra {formatPrice(s.free_over)}</span>}
      </>
    )
  }
  return <span className="text-ink-500">Da definire</span>
}

export default function CartPage() {
  const cart = useCart()
  const { user } = useAuth()
  const { settings } = useSettings()
  const { toast, confirm } = useUi()
  const navigate = useNavigate()
  const { rows, subtotal, loading } = useCartDetails(cart.lines)
  const [removing, setRemoving] = useState<string | null>(null)
  useMeta({ title: 'Carrello', noindex: true })

  const remove = async (line: CartLine, name?: string) => {
    if (!(await confirm({ title: 'Rimuovere dal carrello?', message: name, confirmLabel: 'Rimuovi', danger: true }))) return
    setRemoving(line.id)
    try {
      await cart.remove(line.id)
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setRemoving(null)
    }
  }

  const hasUnavailable = rows.some((r) => r.unavailable)
  const shipping = settings.shipping
  const shippingCost = shipping.mode === 'flat' && shipping.amount !== null ? (shipping.free_over !== null && subtotal >= shipping.free_over ? 0 : shipping.amount) : 0

  if (cart.loading || cart.syncing) {
    return (
      <div className="container py-12">
        <Skeleton className="h-10 w-48" />
        <div className="mt-8 space-y-3"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
        {cart.syncing && <p className="mt-4 text-sm text-ink-500">Sincronizzazione del carrello e caricamento delle grafiche…</p>}
      </div>
    )
  }

  if (!cart.lines.length) {
    return (
      <div className="container py-16">
        <EmptyState icon={<ShoppingBag className="h-6 w-6" />} title="Il carrello è vuoto" description="Scegli un prodotto dal catalogo e personalizzalo." action={<ButtonLink to="/catalogo">Vai al catalogo</ButtonLink>} />
      </div>
    )
  }

  return (
    <div className="container py-10 sm:py-14">
      <h1 className="display-lg text-4xl">Carrello</h1>
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <ul className="space-y-3">
          {rows.map(({ line, product, price, unavailable }) => (
            <li key={line.id} className="surface p-4 sm:p-5">
              <div className="flex gap-4">
                <PreviewThumbs preview={line.configuration.preview ?? { front: line.pendingPreview?.front, back: line.pendingPreview?.back }} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      {product ? (
                        <Link to={`/prodotti/${product.slug}`} className="font-semibold hover:underline">{product.name}</Link>
                      ) : (
                        <p className="font-semibold">{loading ? <Skeleton className="h-5 w-40" /> : 'Prodotto non disponibile'}</p>
                      )}
                      <p className="text-sm text-ink-500">
                        {configQuantity(line.configuration, line.quantity)} {configQuantity(line.configuration, line.quantity) === 1 ? 'capo' : 'capi'}
                        {price && ` · ${formatPrice(price.unit)} cad.`}
                        {price?.discountPercent ? ` · −${price.discountPercent}%` : ''}
                      </p>
                    </div>
                    <p className="text-lg font-semibold">{price ? formatPrice(price.total) : '—'}</p>
                  </div>
                  {product && (
                    <dl className="mt-3 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                      {describeConfiguration(product as ProductDetail, line.configuration).map((d) => (
                        <div key={d.label} className="flex gap-1.5"><dt className="text-ink-500">{d.label}:</dt><dd className="font-medium text-ink-800">{d.value}</dd></div>
                      ))}
                    </dl>
                  )}
                  {unavailable && <p className="mt-2 text-sm font-medium text-danger-600">Questo prodotto non è più disponibile: rimuovilo per procedere.</p>}
                  <div className="mt-3 flex flex-wrap gap-1">
                    {product && !unavailable && (
                      <ButtonLink to={`/prodotti/${product.slug}/personalizza?riga=${line.id}`} variant="ghost" size="sm" icon={<Pencil className="h-4 w-4" />}>Modifica</ButtonLink>
                    )}
                    <Button variant="ghost" size="sm" loading={removing === line.id} icon={<Trash2 className="h-4 w-4" />} onClick={() => remove(line, product?.name)}>Rimuovi</Button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="surface p-5">
            <h2 className="font-sans text-base font-semibold" style={{ fontStretch: '100%' }}>Riepilogo</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-ink-500">Articoli</dt><dd>{cart.count}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Subtotale</dt><dd>{formatPrice(subtotal)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-500">Spedizione</dt><dd className="text-right"><ShippingNote /></dd></div>
              <div className="flex justify-between border-t border-ink-200 pt-3 text-base font-semibold"><dt>Totale stimato</dt><dd>{formatPrice(subtotal + shippingCost)}</dd></div>
            </dl>
            {settings.shipping.note && <p className="mt-3 text-xs text-ink-500">{settings.shipping.note}</p>}
            <Button
              size="lg"
              className="mt-5 w-full"
              disabled={hasUnavailable || loading}
              onClick={() => navigate(user ? '/checkout' : '/accedi', { state: { from: '/checkout' } })}
            >
              {user ? 'Procedi all’ordine' : 'Accedi per ordinare'}
            </Button>
            <p className="mt-3 text-center text-xs text-ink-500">Pagamento alla consegna o con bonifico bancario.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
