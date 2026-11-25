// Prodotti in evidenza. Desktop: a sinistra i nomi in grande, a destra la foto del prodotto
// attivo; passando sopra un nome (o con il focus da tastiera) la foto cambia in dissolvenza.
// Mobile e tablet: le schede del catalogo in una striscia scorrevole.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Shirt } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Product } from '@/types/db'
import { formatPrice } from '@/lib/format'
import { publicUrl } from '@/lib/storage'
import { primaryImage } from '@/features/catalog/api'
import { ProductCard } from '@/features/catalog/ProductCard'

const priceOf = (p: Product) => (Number(p.base_price) > 0 ? `da ${formatPrice(p.base_price)}` : 'Prezzo su richiesta')

export function FeaturedShowcase({ products }: { products: Product[] }) {
  const [active, setActive] = useState(0)
  const current = products[active] ?? products[0]

  return (
    <>
      {/* Desktop */}
      <div className="hidden gap-10 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,.92fr)] xl:gap-16">
        <ul className="flex flex-col justify-center" >
          {products.map((p, i) => {
            const on = i === active
            return (
              <li key={p.id} className="border-b border-ink-200 first:border-t">
                <Link
                  to={`/prodotti/${p.slug}`}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  className="group flex items-center gap-6 py-4 xl:py-5"
                >
                  <span
                    className={cn(
                      'line-clamp-2 min-w-0 flex-1 font-display text-[clamp(1.5rem,2.3vw,2.4rem)] font-black uppercase leading-[1.02] transition-all duration-500',
                      on ? 'translate-x-2 text-ink-950' : 'text-ink-300 group-hover:text-ink-500',
                    )}
                    style={{ fontStretch: '115%' }}
                  >
                    {p.name}
                  </span>
                  <span className={cn('shrink-0 text-right text-sm transition-colors duration-500', on ? 'text-ink-700' : 'text-ink-400')}>{priceOf(p)}</span>
                  <span
                    className={cn(
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all duration-500',
                      on ? 'bg-ink-950 text-gold-400' : 'bg-transparent text-ink-300 ring-1 ring-ink-200',
                    )}
                  >
                    <ArrowRight className={cn('h-4 w-4 transition-transform duration-500', on ? 'translate-x-0' : '-rotate-45')} aria-hidden />
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>

        {/* Foto del prodotto attivo: tutte sovrapposte, visibile solo quella attiva */}
        <Link
          to={`/prodotti/${current.slug}`}
          tabIndex={-1}
          aria-hidden
          className="group relative block h-full min-h-[32rem] overflow-hidden rounded-[2rem] bg-ink-100"
        >
          {products.map((p, i) => {
            const img = primaryImage(p)
            const url = publicUrl(img?.storage_path)
            const on = i === active
            return (
              <div
                key={p.id}
                className={cn('absolute inset-0 transition-[opacity,transform] duration-700 ease-[cubic-bezier(.2,.75,.15,1)]', on ? 'scale-100 opacity-100' : 'scale-[1.04] opacity-0')}
              >
                {url ? (
                  <img src={url} alt="" loading={i < 2 ? 'eager' : 'lazy'} decoding="async" draggable={false} className="h-full w-full object-cover transition-transform duration-[1.2s] group-hover:scale-[1.03]" />
                ) : (
                  <span className="flex h-full items-center justify-center text-ink-300"><Shirt className="h-20 w-20" /></span>
                )}
              </div>
            )
          })}
          <span className="absolute bottom-5 right-5 flex h-14 w-14 items-center justify-center rounded-full bg-ink-950 text-gold-400 shadow-pop transition-transform group-hover:scale-105"><ArrowRight className="h-5 w-5" /></span>
        </Link>
      </div>

      {/* Mobile e tablet: striscia di schede */}
      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:gap-4 lg:hidden">
        {products.map((p, i) => (
          <div key={p.id} className="w-[72vw] max-w-[20rem] shrink-0 snap-start sm:w-[42vw]">
            <ProductCard product={p} eager={i < 2} />
          </div>
        ))}
      </div>
    </>
  )
}
