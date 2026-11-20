// Vetrina della pagina prodotto: la foto fluttua sopra il proprio riflesso, davanti a una
// grande scritta della categoria. Tenendo premuto sulla foto compare una lente che la
// ingrandisce; sotto, le miniature per cambiare foto.

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowLeft, ArrowRight, Shirt, ZoomIn } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/format'
import { publicUrl } from '@/lib/storage'
import type { ProductImage } from '@/types/db'

const LENS = 168 // diametro della lente in px
const ZOOM = 2.6
const HOLD_MS = 160

export function ProductStage({ images, name, word }: { images: ProductImage[]; name: string; word?: string | null }) {
  const [active, setActive] = useState(0)
  const [lens, setLens] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const frame = useRef<HTMLDivElement>(null)
  const hold = useRef<number | null>(null)
  const img = images[Math.min(active, Math.max(0, images.length - 1))]
  const url = publicUrl(img?.storage_path)
  const n = images.length

  const place = (e: { clientX: number; clientY: number }) => {
    const r = frame.current!.getBoundingClientRect()
    setLens({ x: Math.max(0, Math.min(r.width, e.clientX - r.left)), y: Math.max(0, Math.min(r.height, e.clientY - r.top)), w: r.width, h: r.height })
  }
  const stopHold = () => { if (hold.current) window.clearTimeout(hold.current); hold.current = null }
  const onDown = (e: ReactPointerEvent) => {
    if (!url || (e.pointerType === 'mouse' && e.button !== 0)) return
    const p = { clientX: e.clientX, clientY: e.clientY }
    stopHold()
    hold.current = window.setTimeout(() => place(p), e.pointerType === 'mouse' ? 0 : HOLD_MS)
  }
  const onMove = (e: ReactPointerEvent) => { if (lens) place(e) }
  const onUp = () => { stopHold(); setLens(null) }
  useEffect(() => stopHold, [])

  const go = (d: number) => setActive((i) => (i + d + n) % n)

  return (
    <div>
      <div className="relative overflow-hidden rounded-[2rem] bg-[radial-gradient(120%_80%_at_50%_35%,#fff_0%,#F3F1EA_55%,#E7E4DC_100%)] px-6 pb-4 pt-8 sm:px-12 sm:pt-12">
        {/* Grande scritta di sfondo */}
        {word && (
          <p aria-hidden className="pointer-events-none absolute inset-x-0 top-[38%] -translate-y-1/2 select-none whitespace-nowrap text-center font-display text-[clamp(4.5rem,17vw,11rem)] font-black uppercase leading-none text-transparent [-webkit-text-stroke:1.5px_rgba(14,14,16,.12)]" style={{ fontStretch: '125%' }}>
            {word}
          </p>
        )}

        <div className="relative mx-auto max-w-[26rem]">
          {/* Foto fluttuante */}
          <div className="motion-safe:animate-[stage-float_6s_ease-in-out_infinite]">
            <div
              ref={frame}
              className={cn('relative aspect-[4/5] touch-pan-y select-none overflow-hidden rounded-[1.4rem] bg-ink-100 shadow-[0_40px_60px_-30px_rgba(14,14,16,.45)]', url && 'cursor-zoom-in')}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerLeave={onUp}
              onPointerCancel={onUp}
              onContextMenu={(e) => { if (lens) e.preventDefault() }}
            >
              {url ? (
                <img key={img?.id} src={url} alt={img?.alt || name} draggable={false} className="h-full w-full animate-fade-in object-cover" width={img?.width ?? 1000} height={img?.height ?? 1250} fetchPriority="high" />
              ) : (
                <div className="flex h-full items-center justify-center text-ink-300"><Shirt className="h-20 w-20" aria-hidden /></div>
              )}
              {/* Lente */}
              {lens && url && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute rounded-full shadow-[0_18px_40px_-10px_rgba(14,14,16,.55)] ring-[3px] ring-white"
                  style={{
                    width: LENS, height: LENS, left: lens.x - LENS / 2, top: lens.y - LENS / 2,
                    backgroundImage: `url("${url}")`, backgroundRepeat: 'no-repeat',
                    backgroundSize: `${lens.w * ZOOM}px ${lens.h * ZOOM}px`,
                    backgroundPosition: `${-(lens.x * ZOOM - LENS / 2)}px ${-(lens.y * ZOOM - LENS / 2)}px`,
                  }}
                />
              )}
              {url && !lens && (
                <span aria-hidden className="glass glass-light pointer-events-none absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-2xs font-semibold text-ink-900">
                  <ZoomIn className="h-3.5 w-3.5" /> Tieni premuto per ingrandire
                </span>
              )}
            </div>
          </div>

          {/* Riflesso e ombra a terra */}
          {url && (
            <div aria-hidden className="pointer-events-none relative -mt-px h-24 overflow-hidden [mask-image:linear-gradient(to_bottom,rgba(0,0,0,.28),transparent_75%)] motion-safe:animate-[stage-reflect_6s_ease-in-out_infinite]">
              <img src={url} alt="" className="aspect-[4/5] w-full -scale-y-100 rounded-[1.4rem] object-cover blur-[1px]" />
            </div>
          )}
          <div aria-hidden className="mx-auto -mt-20 h-6 w-3/4 rounded-[50%] bg-ink-900/25 blur-xl motion-safe:animate-[stage-shadow_6s_ease-in-out_infinite]" />
        </div>

        {n > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} className="glass glass-light absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-ink-900 sm:left-5" aria-label="Foto precedente"><ArrowLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => go(1)} className="glass glass-light absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-ink-900 sm:right-5" aria-label="Foto successiva"><ArrowRight className="h-4 w-4" /></button>
            <p className="absolute right-5 top-5 font-mono text-xs tabular-nums text-ink-500" aria-hidden>{String(active + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}</p>
          </>
        )}
      </div>

      {n > 1 && (
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto" role="tablist" aria-label="Foto del prodotto">
          {images.map((im, i) => (
            <button
              key={im.id}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={`Foto ${i + 1}`}
              onClick={() => setActive(i)}
              className={cn('h-20 w-16 shrink-0 overflow-hidden rounded-xl ring-2 ring-offset-2 ring-offset-ink-50 transition', i === active ? 'ring-ink-900' : 'ring-transparent opacity-60 hover:opacity-100')}
            >
              <img src={publicUrl(im.storage_path) ?? ''} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Prezzo che "sale" fino al valore quando compare (fermo con riduzione del movimento). */
export function AnimatedPrice({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(value); return }
    let raf = 0
    let fallback = 0
    setShown(0)
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      const t0 = performance.now()
      const tick = (t: number) => {
        const k = Math.min(1, (t - t0) / 900)
        setShown(value * (1 - (1 - k) ** 3))
        if (k < 1) raf = requestAnimationFrame(tick)
        else setShown(value)
      }
      raf = requestAnimationFrame(tick)
      fallback = window.setTimeout(() => setShown(value), 1400) // mai lasciare un prezzo parziale
    })
    io.observe(el)
    return () => { io.disconnect(); cancelAnimationFrame(raf); window.clearTimeout(fallback) }
  }, [value])
  return (
    <span ref={ref} className={className}>
      <span aria-hidden>{formatPrice(shown)}</span>
      <span className="sr-only">{formatPrice(value)}</span>
    </span>
  )
}
