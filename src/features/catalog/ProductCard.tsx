// Scheda prodotto: la foto occupa tutta la scheda e i testi stanno su una sfumatura
// scura. Al passaggio del mouse la scheda si inclina verso il puntatore e la foto
// fluttua; con più foto, muovendo il puntatore in orizzontale si sfogliano (punti in basso).

import { useRef, useState, type PointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Shirt } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Product } from '@/types/db'
import { formatPrice, AVAILABILITY_LABEL, SUPPLY_LABEL } from '@/lib/format'
import { publicUrl } from '@/lib/storage'

const MAX_TILT = 7 // gradi
const MAX_DOTS = 5

const canHover = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function ProductCard({ product, eager }: { product: Product; eager?: boolean }) {
  const images = (product.product_images ?? []).slice(0, MAX_DOTS)
  const [shown, setShown] = useState(0)
  const card = useRef<HTMLAnchorElement>(null)
  const img = images[shown] ?? images[0]
  const url = publicUrl(img?.storage_path)
  const price = Number(product.base_price) > 0 ? formatPrice(product.base_price) : null

  const onMove = (e: PointerEvent<HTMLAnchorElement>) => {
    if (e.pointerType !== 'mouse' || !canHover()) return
    const el = card.current!
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    if (images.length > 1) setShown(Math.min(images.length - 1, Math.floor(x * images.length)))
    if (reduced()) return
    el.style.setProperty('--rx', `${(0.5 - y) * MAX_TILT}deg`)
    el.style.setProperty('--ry', `${(x - 0.5) * MAX_TILT}deg`)
  }
  const onLeave = () => {
    setShown(0)
    card.current?.style.setProperty('--rx', '0deg')
    card.current?.style.setProperty('--ry', '0deg')
  }

  return (
    <div className="h-full [perspective:900px]">
      <Link
        ref={card}
        to={`/prodotti/${product.slug}`}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        className="group relative flex aspect-[4/5] w-full flex-col overflow-hidden rounded-[1.5rem] bg-ink-900 text-white shadow-[0_1px_2px_rgba(14,14,16,.06)] ring-1 ring-ink-900/5 transition-[transform,box-shadow] duration-500 ease-[cubic-bezier(.2,.75,.15,1)] [transform:rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))] hover:shadow-[0_30px_50px_-24px_rgba(14,14,16,.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
      >
        {/* Foto: fluttua leggermente al passaggio */}
        <div className="absolute inset-0 overflow-hidden">
          {url ? (
            <img
              key={img?.id}
              src={url}
              alt={img?.alt || product.name}
              loading={eager ? 'eager' : 'lazy'}
              decoding="async"
              width={img?.width ?? 800}
              height={img?.height ?? 1000}
              className="h-full w-full scale-[1.02] animate-fade-in object-cover transition-transform duration-700 ease-[cubic-bezier(.2,.75,.15,1)] group-hover:scale-[1.07] motion-safe:group-hover:animate-[float_4.5s_ease-in-out_.7s_infinite]"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-ink-100 text-ink-300"><Shirt className="h-14 w-14" aria-hidden /></div>
          )}
        </div>
        {/* Sfumatura per la leggibilità */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-[58%] bg-[linear-gradient(to_top,rgba(8,8,10,.94)_0%,rgba(8,8,10,.82)_38%,rgba(8,8,10,.4)_70%,transparent)]" />

        {/* In alto: tipo e disponibilità */}
        <div className="relative flex flex-wrap items-start gap-1.5 p-2.5 sm:p-3">
          {product.product_type === 'kit' && <span className="glass glass-dark whitespace-nowrap rounded-full px-2.5 py-1 text-2xs font-semibold">Kit</span>}
          {product.is_configurable && <span className="glass glass-light whitespace-nowrap rounded-full px-2.5 py-1 text-2xs font-semibold text-ink-900">Personalizzabile</span>}
          {product.supply_mode === 'on_demand' && <span className="whitespace-nowrap rounded-full bg-gold-500 px-2.5 py-1 text-2xs font-semibold text-ink-950">{SUPPLY_LABEL.on_demand}</span>}
          {product.availability !== 'in_stock' && (
            <span className={cn('whitespace-nowrap rounded-full px-2.5 py-1 text-2xs font-semibold', product.availability === 'out_of_stock' ? 'bg-danger-600 text-white' : 'glass glass-dark')}>
              {AVAILABILITY_LABEL[product.availability]}
            </span>
          )}
        </div>

        {/* In basso: testi sulla foto */}
        <div className="relative mt-auto p-3.5 sm:p-5">
          {images.length > 1 && (
            <div className="mb-3 flex gap-1" aria-hidden>
              {images.map((im, i) => (
                <span key={im.id} className={cn('h-1 rounded-full transition-all duration-300', i === shown ? 'w-5 bg-white' : 'w-1.5 bg-white/45')} />
              ))}
            </div>
          )}
          {product.categories?.name && <p className="font-mono text-2xs uppercase tracking-[.16em] text-white/60">{product.categories.name}</p>}
          <h3 className="mt-1 line-clamp-2 font-display text-white text-[15px] font-bold uppercase leading-tight sm:text-lg" style={{ fontStretch: '108%' }}>{product.name}</h3>
          <div className="mt-2.5 flex items-end justify-between gap-2">
            <p className="text-xs text-white/60">
              {price ? <>da <span className="font-mono text-base font-semibold tracking-tight text-white sm:text-lg">{price}</span></> : 'Prezzo su richiesta'}
            </p>
            <span aria-hidden className="glass glass-light flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-900 transition-transform duration-500 group-hover:-rotate-45 sm:h-10 sm:w-10">
              <ArrowUpRight className="h-4 w-4 rotate-45" />
            </span>
          </div>
        </div>
      </Link>
    </div>
  )
}

export function ProductCardSkeleton() {
  return <div className="aspect-[4/5] animate-pulse rounded-[1.5rem] bg-ink-100" aria-hidden />
}
