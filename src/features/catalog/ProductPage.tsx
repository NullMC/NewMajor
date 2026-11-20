import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Brush, Layers, Ruler, Shirt, Users } from 'lucide-react'
import { cn } from '@/lib/cn'
import { AVAILABILITY_LABEL } from '@/lib/format'
import { publicUrl } from '@/lib/storage'
import { stripMarkdown } from '@/lib/markdown'
import { useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { Badge, EmptyState, Skeleton } from '@/components/ui/Display'
import { Markdown } from '@/components/ui/Markdown'
import { ButtonLink } from '@/components/ui/Button'
import { SHAPE_LABEL } from '@/features/configurator/garment/shapes'
import { getProductBySlug, listRelated } from './api'
import { ProductCard } from './ProductCard'
import { AnimatedPrice, ProductStage } from './ProductStage'

const SITE_URL = (import.meta.env.VITE_SITE_URL || '').replace(/\/$/, '')

export default function ProductPage() {
  const { slug = '' } = useParams()
  const { data: product, loading } = useQuery(`product:${slug}`, () => getProductBySlug(slug))
  const { data: related } = useQuery(product ? `related:${product.id}` : null, () => listRelated(product!.id))
  const [color, setColor] = useState<string | null>(null)

  const images = product?.product_images ?? []
  const imageUrl = publicUrl(images[0]?.storage_path)

  useMeta({
    title: product?.seo_title || product?.name,
    description: product?.seo_description || product?.short_description || stripMarkdown(product?.description),
    image: imageUrl,
    type: 'product',
    jsonLd: product
      ? {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: product.name,
          description: product.short_description || stripMarkdown(product.description, 300),
          image: images.map((i) => publicUrl(i.storage_path)).filter(Boolean),
          category: product.categories?.name,
          brand: { '@type': 'Brand', name: 'New Major' },
          ...(Number(product.base_price) > 0 && {
            offers: {
              '@type': 'Offer',
              priceCurrency: 'EUR',
              price: Number(product.base_price).toFixed(2),
              url: `${SITE_URL || window.location.origin}/prodotti/${product.slug}`,
              availability:
                product.availability === 'in_stock' ? 'https://schema.org/InStock'
                : product.availability === 'on_request' ? 'https://schema.org/PreOrder'
                : 'https://schema.org/OutOfStock',
            },
          }),
        }
      : null,
  })

  if (loading && !product) {
    return (
      <div className="container grid gap-10 py-10 lg:grid-cols-2">
        <Skeleton className="aspect-[4/5]" />
        <div className="space-y-4"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-6 w-1/3" /><Skeleton className="h-32" /></div>
      </div>
    )
  }
  if (!product) {
    return (
      <div className="container py-16">
        <EmptyState title="Prodotto non trovato" description="Il prodotto potrebbe essere stato rimosso." action={<ButtonLink to="/catalogo">Vai al catalogo</ButtonLink>} />
      </div>
    )
  }

  const variants = product.product_variants.filter((v) => v.is_active)
  const garmentTypes = (product.product_garment_types ?? []).filter((g) => g.garment_types)
  const graphicAreas = product.customization_areas.filter((a) => a.is_active && ['logo', 'sponsor', 'all_over'].includes(a.area_type))
  const hasRoster = product.customization_areas.some((a) => a.is_active && ['text', 'number'].includes(a.area_type))
  const unavailable = product.availability === 'out_of_stock'

  return (
    <div className="container py-6 sm:py-10">
      <nav aria-label="Percorso" className="text-sm text-ink-500">
        <Link to="/catalogo" className="hover:text-ink-900">Catalogo</Link>
        {product.categories && <><span className="mx-2">/</span><Link to={`/catalogo/${product.categories.slug}`} className="hover:text-ink-900">{product.categories.name}</Link></>}
      </nav>

      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14">
        <ProductStage images={images} name={product.name} word={product.categories?.name} />

        {/* Info */}
        <div className="lg:pt-6">
          <div className="flex flex-wrap gap-2">
            {product.product_type === 'kit' && <Badge tone="dark">Kit da gara</Badge>}
            {product.is_configurable && <Badge tone="gold">Personalizzabile</Badge>}
            <Badge tone={product.availability === 'in_stock' ? 'success' : product.availability === 'out_of_stock' ? 'danger' : 'neutral'}>
              {AVAILABILITY_LABEL[product.availability]}
            </Badge>
          </div>
          {product.categories?.name && <p className="mt-5 font-mono text-xs uppercase tracking-[.2em] text-ink-500">{product.categories.name}</p>}
          <h1 className="mt-2 font-display text-[clamp(2.1rem,5.4vw,3.6rem)] font-black uppercase leading-[.92] text-ink-950" style={{ fontStretch: '112%' }}>{product.name}</h1>
          {product.short_description && <p className="mt-4 max-w-lg text-lg leading-8 text-ink-600">{product.short_description}</p>}

          <div className="mt-6 flex flex-wrap items-end gap-x-3 gap-y-1">
            {Number(product.base_price) > 0 ? (
              <>
                <span className="pb-1.5 text-sm text-ink-500">a partire da</span>
                <AnimatedPrice value={Number(product.base_price)} className="font-mono text-4xl font-semibold tabular-nums tracking-tight text-ink-950 sm:text-5xl" />
                <span className="pb-1.5 text-sm text-ink-500">/ capo</span>
              </>
            ) : (
              <span className="text-lg font-semibold text-ink-700">Prezzo su richiesta</span>
            )}
          </div>
          {product.price_tiers.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {product.price_tiers.map((t) => (
                <li key={t.id} className="rounded-full bg-success-50 px-3 py-1 font-mono text-xs font-semibold text-success-700">
                  da {t.min_quantity} pz −{Number(t.discount_percent)}%
                </li>
              ))}
            </ul>
          )}

          {/* Colori: la scelta viene passata al configuratore */}
          {variants.length > 0 && (
            <fieldset className="mt-7">
              <legend className="text-sm font-semibold text-ink-900">
                Colore <span className="font-normal text-ink-500">· {(variants.find((v) => v.id === color) ?? variants[0]).name}</span>
              </legend>
              <div className="mt-3 flex flex-wrap gap-2.5">
                {variants.map((v) => {
                  const on = (color ?? variants[0].id) === v.id
                  return (
                    <label key={v.id} className="relative cursor-pointer" title={v.name}>
                      <input type="radio" name="colore" value={v.id} checked={on} onChange={() => setColor(v.id)} className="peer sr-only" />
                      <span
                        aria-hidden
                        className={cn('block h-10 w-10 rounded-full ring-1 ring-ink-900/15 transition peer-focus-visible:ring-2 peer-focus-visible:ring-gold-500', on ? 'outline outline-2 outline-offset-[3px] outline-ink-900' : 'scale-90 hover:scale-100')}
                        style={{ background: v.secondary_hex ? `linear-gradient(135deg, ${v.color_hex} 0 58%, ${v.secondary_hex} 58%)` : v.color_hex }}
                      />
                      <span className="sr-only">{v.name}</span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          )}

          {product.sizes.length > 0 && (
            <div className="mt-6">
              <p className="text-sm font-semibold text-ink-900">Taglie disponibili</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {product.sizes.map((s) => (
                  <li key={s} className="flex h-10 min-w-[2.75rem] items-center justify-center rounded-xl px-3 font-mono text-sm ring-1 ring-ink-200">{s}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-500">Taglie e quantità per ogni giocatore si indicano nel passaggio successivo.</p>
            </div>
          )}

          <div className="mt-8">
            {unavailable ? (
              <p className="rounded-xl bg-ink-100 p-4 text-sm text-ink-600">Prodotto al momento non disponibile. <Link to="/contatti" className="font-semibold text-ink-900 underline">Contattaci</Link> per informazioni.</p>
            ) : (
              <ButtonLink
                to={`/prodotti/${product.slug}/personalizza${color ? `?colore=${encodeURIComponent(color)}` : ''}`}
                size="lg"
                className="h-14 w-full rounded-full text-base sm:w-auto sm:px-8"
                icon={<Brush className="h-5 w-5" />}
              >
                {product.is_configurable ? 'Personalizza con anteprima 3D' : 'Scegli taglie e quantità'}
              </ButtonLink>
            )}
          </div>

          <div className="mt-10 space-y-5 border-t border-ink-200 pt-6">
            {product.product_type === 'kit' && product.kit_items.length > 0 && (
              <Info icon={<Layers className="h-4 w-4" />} label="Composizione kit">
                {product.kit_items.map((k) => `${k.quantity > 1 ? `${k.quantity}× ` : ''}${k.label}`).join(' · ')}
              </Info>
            )}
            {garmentTypes.length > 0 && (
              <Info icon={<Shirt className="h-4 w-4" />} label="Tipologie disponibili">
                {garmentTypes.map((g) => g.garment_types!.name).join(' · ')}
              </Info>
            )}
            {product.product_type === 'simple' && (
              <Info icon={<Shirt className="h-4 w-4" />} label="Modello">{SHAPE_LABEL[product.model_shape]}</Info>
            )}
            {(graphicAreas.length > 0 || hasRoster) && (
              <Info icon={<Users className="h-4 w-4" />} label="Personalizzazioni">
                {[...graphicAreas.map((a) => a.name), ...(hasRoster ? ['Nomi e numeri'] : [])].join(' · ')}
              </Info>
            )}
            {product.min_quantity > 1 && (
              <Info icon={<Ruler className="h-4 w-4" />} label="Ordine minimo">{product.min_quantity} pezzi</Info>
            )}
          </div>

          {product.description && (
            <div className="mt-10">
              <h2 className="font-sans text-base font-semibold" style={{ fontStretch: '100%' }}>Descrizione</h2>
              <Markdown source={product.description} className="mt-3" />
            </div>
          )}
        </div>
      </div>

      {!!related?.length && (
        <section className="mt-20" aria-labelledby="related">
          <h2 id="related" className="display-lg text-2xl">Prodotti correlati</h2>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-4">
            {related.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}
    </div>
  )
}

function Info({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-700">{icon}</span>
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-ink-900">{label}</p>
        <div className="text-ink-600">{children}</div>
      </div>
    </div>
  )
}
