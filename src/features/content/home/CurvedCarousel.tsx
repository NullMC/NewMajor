// Prodotti in evidenza su un nastro curvo, come visti attraverso una lente:
// le schede stanno sulla parete interna di un cilindro. Trascina, scorri o usa le frecce.

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Shirt } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Product } from '@/types/db'
import { formatPrice } from '@/lib/format'
import { publicUrl } from '@/lib/storage'
import { primaryImage } from '@/features/catalog/api'

const STEP = 27 // gradi tra una scheda e l'altra

export function CurvedCarousel({ products }: { products: Product[] }) {
  const [index, setIndex] = useState(0)
  const [offset, setOffset] = useState(0) // gradi durante il trascinamento
  const drag = useRef<{ x: number; moved: boolean } | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const n = products.length
  const go = (i: number) => setIndex(Math.max(0, Math.min(n - 1, i)))

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    // rotella orizzontale (trackpad)
    let acc = 0
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
      e.preventDefault()
      acc += e.deltaX
      if (Math.abs(acc) > 60) {
        setIndex((i) => Math.max(0, Math.min(n - 1, i + Math.sign(acc))))
        acc = 0
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [n])

  const p = products[index]
  return (
    <div>
      <div
        ref={wrap}
        className="relative mx-auto h-[23rem] touch-pan-y select-none overflow-hidden [perspective:1100px] sm:h-[30rem]"
        onPointerDown={(e) => { drag.current = { x: e.clientX, moved: false }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) }}
        onPointerMove={(e) => {
          if (!drag.current) return
          const dx = e.clientX - drag.current.x
          if (Math.abs(dx) > 6) drag.current.moved = true
          setOffset(-dx / 9)
        }}
        onPointerUp={() => {
          const steps = Math.round(offset / STEP)
          if (steps) go(index + steps)
          setOffset(0)
          setTimeout(() => { drag.current = null }, 0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') go(index + 1)
          if (e.key === 'ArrowLeft') go(index - 1)
        }}
        role="region"
        aria-roledescription="carosello"
        aria-label="Prodotti in evidenza"
      >
        <div
          className={cn('absolute left-1/2 top-1/2 h-0 w-0 [transform-style:preserve-3d]', !offset && 'transition-transform duration-700 ease-[cubic-bezier(.2,.75,.15,1)]')}
          style={{ transform: `translateZ(var(--r)) rotateY(${index * STEP + offset}deg)`, ['--r' as string]: 'clamp(560px, 62vw, 900px)' }}
        >
          {products.map((prod, i) => {
            const img = primaryImage(prod)
            const url = publicUrl(img?.storage_path)
            const near = Math.abs(i - index) <= 3
            return (
              <Link
                key={prod.id}
                to={`/prodotti/${prod.slug}`}
                tabIndex={i === index ? 0 : -1}
                aria-hidden={i !== index}
                onClick={(e) => { if (drag.current?.moved) e.preventDefault(); else if (i !== index) { e.preventDefault(); go(i) } }}
                className={cn(
                  'absolute -left-[8.5rem] -top-[11rem] block h-[22rem] w-[17rem] overflow-hidden rounded-[1.5rem] bg-ink-100 shadow-pop [backface-visibility:hidden] sm:-left-[10.5rem] sm:-top-[14rem] sm:h-[28rem] sm:w-[21rem]',
                  !near && 'invisible',
                )}
                style={{ transform: `rotateY(${-i * STEP}deg) translateZ(calc(var(--r) * -1))` }}
                draggable={false}
              >
                {url ? (
                  <img src={url} alt={img?.alt || prod.name} draggable={false} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full items-center justify-center text-ink-300"><Shirt className="h-16 w-16" aria-hidden /></span>
                )}
                <span className={cn('absolute inset-0 bg-ink-950 transition-opacity duration-700', i === index ? 'opacity-0' : 'opacity-25')} />
              </Link>
            )
          })}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-4">
        <div className="min-w-0" aria-live="polite">
          <p className="truncate text-lg font-semibold">{p.name}</p>
          <p className="font-mono text-sm text-ink-500">
            {Number(p.base_price) > 0 ? <>da {formatPrice(p.base_price)}</> : 'Prezzo su richiesta'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="font-mono text-sm tabular-nums text-ink-500">{String(index + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}</span>
          <button type="button" onClick={() => go(index - 1)} disabled={index === 0} className="flex h-11 w-11 items-center justify-center rounded-full ring-1 ring-ink-200 transition hover:bg-ink-900 hover:text-white disabled:opacity-30" aria-label="Precedente">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => go(index + 1)} disabled={index === n - 1} className="flex h-11 w-11 items-center justify-center rounded-full ring-1 ring-ink-200 transition hover:bg-ink-900 hover:text-white disabled:opacity-30" aria-label="Successivo">
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
