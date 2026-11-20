import { Link } from 'react-router-dom'
import { ArrowUpRight, Shirt } from 'lucide-react'
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
      className="group flex h-full flex-col overflow-hidden rounded-[1.5rem] bg-white ring-1 ring-ink-200 transition-[box-shadow,transform] duration-500 hover:-translate-y-1 hover:shadow-card"
    >
      <div className="relative m-1.5 aspect-[4/5] overflow-hidden rounded-[1.15rem] bg-ink-100">
        {url ? (
          <img
            src={url}
            alt={img?.alt || product.name}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            width={img?.width ?? 800}
            height={img?.height ?? 1000}
            className="h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(.2,.75,.15,1)] group-hover:scale-[1.06]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-ink-300"><Shirt className="h-14 w-14" aria-hidden /></div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {product.product_type === 'kit' && <span className="glass glass-dark rounded-full px-2.5 py-1 text-2xs font-semibold">Kit</span>}
          {product.is_configurable && <span className="glass glass-light rounded-full px-2.5 py-1 text-2xs font-semibold text-ink-900">Personalizzabile</span>}
        </div>
        <span aria-hidden className="glass glass-light absolute bottom-3 right-3 flex h-10 w-10 translate-y-3 items-center justify-center rounded-full text-ink-900 opacity-0 transition duration-500 group-hover:translate-y-0 group-hover:opacity-100">
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 px-4 pb-4 pt-3">
        {product.categories?.name && <p className="label-caps">{product.categories.name}</p>}
        <h3 className="font-sans text-[15px] font-semibold leading-snug text-ink-900" style={{ fontStretch: '100%' }}>{product.name}</h3>
        {product.short_description && <p className="line-clamp-2 text-sm text-ink-500">{product.short_description}</p>}
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <p className="text-sm text-ink-500">
            {Number(product.base_price) > 0 ? <>da <span className="font-mono text-base font-semibold tracking-tight text-ink-900">{formatPrice(product.base_price)}</span></> : 'Prezzo su richiesta'}
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
    <div className="overflow-hidden rounded-[1.5rem] bg-white ring-1 ring-ink-200" aria-hidden>
      <div className="m-1.5 aspect-[4/5] animate-pulse rounded-[1.15rem] bg-ink-100" />
      <div className="space-y-2 p-4">
        <div className="h-3 w-1/3 animate-pulse rounded bg-ink-100" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-ink-100" />
        <div className="h-4 w-1/4 animate-pulse rounded bg-ink-100" />
      </div>
    </div>
  )
}
