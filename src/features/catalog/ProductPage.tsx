import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Brush, Layers, Ruler, Shirt, Users } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatPrice, AVAILABILITY_LABEL } from '@/lib/format'
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

const SITE_URL = (import.meta.env.VITE_SITE_URL || '').replace(/\/$/, '')

export default function ProductPage() {
  const { slug = '' } = useParams()
  const { data: product, loading } = useQuery(`product:${slug}`, () => getProductBySlug(slug))
  const { data: related } = useQuery(product ? `related:${product.id}` : null, () => listRelated(product!.id))
  const [active, setActive] = useState(0)

  const images = product?.product_images ?? []
  const img = images[Math.min(active, Math.max(0, images.length - 1))]
  const imageUrl = publicUrl(img?.storage_path)

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
        {/* Galleria */}
        <div className="space-y-3">
          <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-ink-100">
            {imageUrl ? (
              <img src={imageUrl} alt={img?.alt || product.name} className="h-full w-full object-cover" width={img?.width ?? 1000} height={img?.height ?? 1250} />
            ) : (
              <div className="flex h-full items-center justify-center text-ink-300"><Shirt className="h-20 w-20" aria-hidden /></div>
            )}
          </div>
          {images.length > 1 && (
            <div className="no-scrollbar flex gap-2 overflow-x-auto" role="tablist" aria-label="Immagini prodotto">
              {images.map((im, i) => (
                <button
                  key={im.id}
                  role="tab"
                  aria-selected={i === active}
                  aria-label={`Immagine ${i + 1}`}
                  onClick={() => setActive(i)}
                  className={cn('h-20 w-16 shrink-0 overflow-hidden rounded-xl border-2', i === active ? 'border-ink-900' : 'border-transparent opacity-70 hover:opacity-100')}
                >
                  <img src={publicUrl(im.storage_path) ?? ''} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="lg:pt-4">
          <div className="flex flex-wrap gap-2">
            {product.product_type === 'kit' && <Badge tone="dark">Kit da gara</Badge>}
            {product.is_configurable && <Badge tone="gold">Personalizzabile</Badge>}
            <Badge tone={product.availability === 'in_stock' ? 'success' : product.availability === 'out_of_stock' ? 'danger' : 'neutral'}>
              {AVAILABILITY_LABEL[product.availability]}
            </Badge>
          </div>
          <h1 className="display-lg mt-4 text-3xl sm:text-4xl">{product.name}</h1>
          {product.short_description && <p className="mt-3 text-lg text-ink-600">{product.short_description}</p>}
          <p className="mt-5 text-ink-500">
            {Number(product.base_price) > 0
              ? <>A partire da <span className="text-2xl font-bold text-ink-900">{formatPrice(product.base_price)}</span> <span className="text-sm">/ capo</span></>
              : 'Prezzo su richiesta'}
          </p>
          {product.price_tiers.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {product.price_tiers.map((t) => (
                <li key={t.id} className="rounded-lg bg-success-50 px-2.5 py-1 text-xs font-semibold text-success-700">
                  da {t.min_quantity} pz −{Number(t.discount_percent)}%
                </li>
              ))}
            </ul>
          )}

          <div className="mt-8 space-y-5 border-y border-ink-200 py-6">
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
            {variants.length > 0 && (
              <Info icon={<Brush className="h-4 w-4" />} label={`${variants.length} ${variants.length === 1 ? 'colore' : 'colori'}`}>
                <span className="mt-1 flex flex-wrap gap-1.5">
                  {variants.map((v) => (
                    <span key={v.id} title={v.name} className="h-6 w-6 rounded-full border border-ink-200" style={{ background: v.secondary_hex ? `linear-gradient(135deg, ${v.color_hex} 0 60%, ${v.secondary_hex} 60%)` : v.color_hex }} />
                  ))}
                </span>
              </Info>
            )}
            {product.sizes.length > 0 && (
              <Info icon={<Ruler className="h-4 w-4" />} label="Taglie">{product.sizes.join(' · ')}</Info>
            )}
            {(graphicAreas.length > 0 || hasRoster) && (
              <Info icon={<Users className="h-4 w-4" />} label="Personalizzazioni">
                {[...graphicAreas.map((a) => a.name), ...(hasRoster ? ['Nomi e numeri'] : [])].join(' · ')}
              </Info>
            )}
            {product.min_quantity > 1 && <p className="text-sm text-ink-500">Ordine minimo: {product.min_quantity} pezzi.</p>}
          </div>

          <div className="mt-6">
            {unavailable ? (
              <p className="rounded-xl bg-ink-100 p-4 text-sm text-ink-600">Prodotto al momento non disponibile. <Link to="/contatti" className="font-semibold text-ink-900 underline">Contattaci</Link> per informazioni.</p>
            ) : (
              <ButtonLink to={`/prodotti/${product.slug}/personalizza`} size="lg" className="w-full sm:w-auto" icon={<Brush className="h-5 w-5" />}>
                {product.is_configurable ? 'Personalizza con anteprima 3D' : 'Scegli taglie e quantità'}
              </ButtonLink>
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
