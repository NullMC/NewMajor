// Prodotti in evidenza in un carosello coverflow a giro continuo: il prodotto attivo al centro,
// gli altri ai due lati ruotati e arretrati in profondità, così la sezione è piena su tutta la
// larghezza. Scorre da solo finché non lo tocchi; trascina, scorri, usa le frecce o la tastiera.
// Clic su una scheda laterale: la porta al centro; clic sulla scheda centrale: apre il prodotto.

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Shirt } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Product } from '@/types/db'
import { formatPrice } from '@/lib/format'
import { publicUrl } from '@/lib/storage'
import { primaryImage } from '@/features/catalog/api'

const AUTOPLAY_MS = 4500
const EASE = 'cubic-bezier(.2,.75,.15,1)'

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return { ref, w }
}

export function FeaturedCarousel({ products }: { products: Product[] }) {
  const n = products.length
  const { ref: stage, w } = useWidth()
  const [pos, setPos] = useState(0) // indice, frazionario durante il trascinamento
  const [dragging, setDragging] = useState(false)
  const [touched, setTouched] = useState(false)
  const [hover, setHover] = useState(false)
  const [inView, setInView] = useState(false)
  const drag = useRef<{ x: number; start: number; last: number; moved: boolean; id: number } | null>(null)
  const justDragged = useRef(false)

  const wide = w >= 900
  const cardW = wide ? Math.min(420, w * 0.3) : Math.min(320, w * 0.62)
  const cardH = cardW * 1.25
  const gap = cardW * (wide ? 0.86 : 0.7) // distanza tra il centro e la prima scheda laterale
  const side = wide ? 3 : 1 // schede visibili per lato
  const active = ((Math.round(pos) % n) + n) % n
  const current = products[active]

  const go = useCallback((p: number) => setPos(Math.round(p)), [])
  const step = (dir: number) => { setTouched(true); go(Math.round(pos) + dir) }

  // pausa quando la sezione è fuori schermo
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.3 })
    io.observe(el)
    return () => io.disconnect()
  }, [stage])

  // avanzamento automatico finché l'utente non interagisce
  useEffect(() => {
    if (n < 2 || touched || hover || !inView || dragging) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = window.setInterval(() => { if (!document.hidden) setPos((p) => Math.round(p) + 1) }, AUTOPLAY_MS)
    return () => window.clearInterval(t)
  }, [n, touched, hover, inView, dragging])

  // rotella orizzontale (trackpad)
  useEffect(() => {
    const el = stage.current
    if (!el) return
    let acc = 0
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
      e.preventDefault()
      acc += e.deltaX
      if (Math.abs(acc) > 60) { setTouched(true); setPos((p) => Math.round(p) + Math.sign(acc)); acc = 0 }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [stage])

  /** Distanza circolare dal centro (giro continuo). */
  const offsetOf = (i: number) => ((((i - pos + n / 2) % n) + n) % n) - n / 2

  const cardStyle = (i: number): CSSProperties => {
    const d = offsetOf(i)
    const a = Math.abs(d)
    const s = Math.sign(d)
    const near = Math.min(a, 1)
    const x = s * (near * gap + Math.max(0, a - 1) * cardW * (wide ? 0.52 : 0.4))
    return {
      width: cardW,
      height: cardH,
      transform: `translate3d(calc(-50% + ${x}px), 0, ${-a * (wide ? 170 : 120)}px) rotateY(${-s * near * 42}deg)`,
      opacity: a > side + 0.6 ? 0 : 1,
      filter: `brightness(${1 - Math.min(a, 3) * 0.13})`,
      zIndex: 100 - Math.round(a * 10),
      transition: dragging ? 'none' : `transform 800ms ${EASE}, opacity 500ms ${EASE}, filter 500ms ${EASE}`,
    }
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1) }
  }

  const price = (p: Product) => (Number(p.base_price) > 0 ? `da ${formatPrice(p.base_price)}` : 'Prezzo su richiesta')

  return (
    <div>
      <div
        ref={stage}
        role="region"
        aria-roledescription="carosello"
        aria-label="Prodotti in evidenza"
        tabIndex={0}
        onKeyDown={onKey}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="relative -mx-4 touch-pan-y select-none overflow-hidden rounded-3xl outline-none [perspective:1400px] focus-visible:ring-2 focus-visible:ring-gold-500/60 sm:mx-0 [mask-image:linear-gradient(to_right,transparent,#000_7%,#000_93%,transparent)]"
        style={{ height: w ? cardH + 64 : '26rem' }}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          drag.current = { x: e.clientX, start: pos, last: pos, moved: false, id: e.pointerId }
        }}
        onPointerMove={(e) => {
          const g = drag.current
          if (!g) return
          const dx = e.clientX - g.x
          if (!g.moved && Math.abs(dx) > 6) {
            g.moved = true
            setDragging(true)
            setTouched(true)
            try { (e.currentTarget as HTMLElement).setPointerCapture(g.id) } catch { /* puntatore già rilasciato */ }
          }
          if (g.moved) { g.last = g.start - dx / gap; setPos(g.last) }
        }}
        onPointerUp={() => {
          const g = drag.current
          drag.current = null
          if (!g?.moved) return
          justDragged.current = true
          setTimeout(() => { justDragged.current = false }, 0)
          setDragging(false)
          go(g.last)
        }}
        onPointerCancel={() => { const g = drag.current; drag.current = null; setDragging(false); if (g) go(g.last) }}
      >
        <div className="absolute inset-0 top-6 [transform-style:preserve-3d]">
          {products.map((p, i) => {
            const d = offsetOf(i)
            const isActive = Math.abs(d) < 0.5
            const img = primaryImage(p)
            const url = publicUrl(img?.storage_path)
            return (
              <Link
                key={p.id}
                to={`/prodotti/${p.slug}`}
                draggable={false}
                tabIndex={isActive ? 0 : -1}
                aria-hidden={!isActive}
                aria-label={isActive ? `${p.name}, ${price(p)}` : undefined}
                onClick={(e) => {
                  if (justDragged.current) { e.preventDefault(); return }
                  if (!isActive) { e.preventDefault(); setTouched(true); go(pos + d) }
                }}
                className={cn(
                  'group absolute left-1/2 top-0 block overflow-hidden rounded-[1.75rem] bg-ink-100 shadow-[0_40px_70px_-35px_rgba(8,8,10,.6)]',
                  isActive ? 'cursor-pointer ring-1 ring-ink-900/10' : 'cursor-pointer',
                )}
                style={cardStyle(i)}
              >
                {url ? (
                  <img src={url} alt={img?.alt || p.name} draggable={false} loading={Math.abs(d) <= 2 ? 'eager' : 'lazy'} decoding="async" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
                ) : (
                  <span className="flex h-full items-center justify-center text-ink-300"><Shirt className="h-16 w-16" aria-hidden /></span>
                )}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Prodotto attivo e comandi */}
      <div className="mt-6 flex items-center justify-between gap-4 sm:mt-8">
        <button type="button" onClick={() => step(-1)} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full ring-1 ring-ink-200 transition hover:bg-ink-950 hover:text-gold-400 hover:ring-ink-950" aria-label="Prodotto precedente">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Link key={current.id} to={`/prodotti/${current.slug}`} className="min-w-0 animate-slide-up text-center" aria-live="polite">
          <span className="block truncate font-display text-[clamp(1.25rem,3vw,2rem)] font-black uppercase leading-tight text-ink-950" style={{ fontStretch: '112%' }}>{current.name}</span>
          <span className="mt-1 block text-sm text-ink-500">{price(current)}</span>
        </Link>
        <button type="button" onClick={() => step(1)} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full ring-1 ring-ink-200 transition hover:bg-ink-950 hover:text-gold-400 hover:ring-ink-950" aria-label="Prodotto successivo">
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}
