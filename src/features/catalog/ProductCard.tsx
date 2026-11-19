import { Link } from 'react-router-dom'
import { Shirt } from 'lucide-react'
import type { Product } from '@/types/db'
import { formatPrice, AVAILABILITY_LABEL } from '@/lib/format'
import { publicUrl } from '@/lib/storage'
import { Badge } from '@/components/ui/Display'
import { primaryImage } from './api'

export function ProductCard({ product, eager }: { product: Product; eager?: boolean }) {
  const img = primaryImage(product)
  const url = publicUrl(img?.storage_path)
  return (
    <Link
      to={`/prodotti/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white transition-shadow hover:shadow-card"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-ink-100">
        {url ? (
          <img
            src={url}
            alt={img?.alt || product.name}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            width={img?.width ?? 800}
            height={img?.height ?? 1000}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-ink-300"><Shirt className="h-14 w-14" aria-hidden /></div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {product.product_type === 'kit' && <Badge tone="dark">Kit</Badge>}
          {product.is_configurable && <Badge tone="gold">Personalizzabile</Badge>}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        {product.categories?.name && <p className="label-caps">{product.categories.name}</p>}
        <h3 className="font-sans text-[15px] font-semibold leading-snug text-ink-900" style={{ fontStretch: '100%' }}>{product.name}</h3>
        {product.short_description && <p className="line-clamp-2 text-sm text-ink-500">{product.short_description}</p>}
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <p className="text-sm text-ink-500">
            {Number(product.base_price) > 0 ? <>da <span className="text-base font-semibold text-ink-900">{formatPrice(product.base_price)}</span></> : 'Prezzo su richiesta'}
          </p>
          {product.availability !== 'in_stock' && (
            <Badge tone={product.availability === 'out_of_stock' ? 'danger' : 'neutral'}>{AVAILABILITY_LABEL[product.availability]}</Badge>
          )}
        </div>
      </div>
    </Link>
  )
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white" aria-hidden>
      <div className="aspect-[4/5] animate-pulse bg-ink-100" />
      <div className="space-y-2 p-4">
        <div className="h-3 w-1/3 animate-pulse rounded bg-ink-100" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-ink-100" />
        <div className="h-4 w-1/4 animate-pulse rounded bg-ink-100" />
      </div>
    </div>
  )
}
