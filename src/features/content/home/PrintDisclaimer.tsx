// Avviso sulla qualità delle grafiche: a sinistra la stessa maglia stampata da un file
// piccolo (sgranata) e da un file curato, separate da un cursore da trascinare; a destra
// il messaggio e l'invito a richiedere una consulenza dal modulo contatti.

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowRight, Check, MoveHorizontal } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { AccentTitle, Reveal } from '@/components/fx/Reveal'
import type { HomeSections } from '../api'

export type DisclaimerContent = NonNullable<HomeSections['disclaimer']>

export const DISCLAIMER_DEFAULT: DisclaimerContent = {
  title: 'Una buona stampa parte da una buona grafica',
  text: 'Le grafiche troppo piccole, o generate con l’intelligenza artificiale in modo superficiale e con poca attenzione ai dettagli, possono dare stampe sgranate e risultati diversi da quelli attesi. Per evitarlo, richiedi una consulenza diretta tramite il modulo contatti.',
  points: [
    'Eviti stampe sgranate e risultati non desiderati',
    'Ci aiuti a preparare il lavoro più facilmente',
    'Ricevi la tua fornitura in tempi più brevi',
  ],
}

const SRC = '/hero/lupo-front.webp'
const PIXELS = 46 // risoluzione della versione "file piccolo" (pixel sul lato)
const FOCUS = { x: 0.5, y: 0.36 } // inquadratura: petto con gli sponsor

/** Ritaglio quadrato della foto, uguale per le due versioni. */
function useCrop() {
  const [crop, setCrop] = useState<{ low: string; high: string } | null>(null)
  useEffect(() => {
    let alive = true
    const img = new Image()
    img.decoding = 'async'
    img.src = SRC
    img.onload = () => {
      if (!alive) return
      const side = Math.min(img.naturalWidth, img.naturalHeight) * 0.62
      const sx = (img.naturalWidth - side) * FOCUS.x
      const sy = (img.naturalHeight - side) * FOCUS.y
      const draw = (size: number, smooth: boolean) => {
        const c = document.createElement('canvas')
        c.width = c.height = size
        const g = c.getContext('2d')!
        g.imageSmoothingEnabled = smooth
        g.imageSmoothingQuality = 'high'
        g.drawImage(img, sx, sy, side, side, 0, 0, size, size)
        return c.toDataURL(smooth ? 'image/webp' : 'image/png', 0.92)
      }
      setCrop({ low: draw(PIXELS, true), high: draw(Math.round(side), true) })
    }
    return () => { alive = false }
  }, [])
  return crop
}

function PrintCompare() {
  const crop = useCrop()
  const [x, setX] = useState(50)
  const [touched, setTouched] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  // Al primo ingresso il cursore oscilla una volta per mostrare che si può trascinare
  useEffect(() => {
    const el = box.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      const t0 = performance.now()
      const tick = (t: number) => {
        if (dragging.current) return
        const k = Math.min(1, (t - t0) / 2200)
        setX(50 + Math.sin(k * Math.PI * 2) * 22 * (1 - k))
        if (k < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }, { threshold: 0.6 })
    io.observe(el)
    return () => { io.disconnect(); cancelAnimationFrame(raf) }
  }, [])

  const fromPointer = (clientX: number) => {
    const r = box.current!.getBoundingClientRect()
    setX(Math.max(4, Math.min(96, ((clientX - r.left) / r.width) * 100)))
  }

  return (
    <div
      ref={box}
      className="relative aspect-square cursor-ew-resize touch-pan-y select-none overflow-hidden rounded-[1.5rem] bg-ink-900 has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-gold-500 has-[input:focus-visible]:ring-offset-2"
      style={{ '--x': `${x}%` } as CSSProperties}
      onPointerDown={(e) => { dragging.current = true; setTouched(true); fromPointer(e.clientX); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) }}
      onPointerMove={(e) => { if (dragging.current) fromPointer(e.clientX) }}
      onPointerUp={() => { dragging.current = false }}
      onPointerCancel={() => { dragging.current = false }}
    >
      {crop && (
        <>
          <img src={crop.high} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
          <img
            src={crop.low}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover [image-rendering:pixelated]"
            style={{ clipPath: 'inset(0 calc(100% - var(--x)) 0 0)' }}
          />
        </>
      )}

      {/* Divisore */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,.15)]" style={{ left: 'var(--x)' }}>
        <span className="glass glass-light absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-ink-900 shadow-pop">
          <MoveHorizontal className="h-4 w-4" />
        </span>
      </div>

      <span className="glass glass-dark pointer-events-none absolute bottom-3 left-3 rounded-full px-3 py-1.5 font-mono text-2xs font-medium uppercase tracking-wider text-white">File piccolo</span>
      <span className="glass glass-light pointer-events-none absolute bottom-3 right-3 rounded-full px-3 py-1.5 font-mono text-2xs font-medium uppercase tracking-wider text-ink-900">File curato</span>
      {!touched && (
        <span className="glass glass-dark pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1.5 text-2xs font-semibold text-white">Trascina per confrontare</span>
      )}

      {/* Comando accessibile da tastiera */}
      <input
        type="range"
        min={4}
        max={96}
        value={Math.round(x)}
        onChange={(e) => { setTouched(true); setX(Number(e.target.value)) }}
        aria-label="Confronta stampa da file piccolo e da file curato"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
      />
    </div>
  )
}

export function PrintDisclaimer({ content }: { content: DisclaimerContent }) {
  const points = (content.points ?? []).filter(Boolean)
  return (
    <section className="container pt-20 sm:pt-28 lg:pt-32" aria-labelledby="print-disclaimer">
      <Reveal className="grid items-center gap-8 rounded-[2rem] bg-white p-4 ring-1 ring-ink-200 sm:p-6 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] lg:gap-14 lg:p-8">
        <PrintCompare />
        <div className="px-2 pb-4 sm:px-4 lg:px-0 lg:py-6 lg:pr-6">
          <h2 id="print-disclaimer" className="display-lg text-[clamp(1.5rem,6.6vw,2.75rem)]">
            <AccentTitle text={content.title} accentClassName="text-gold-600" />
          </h2>
          {content.text && <p className="mt-5 max-w-xl text-lg leading-8 text-ink-600">{content.text}</p>}
          {points.length > 0 && (
            <ul className="mt-6 space-y-3">
              {points.map((p) => (
                <li key={p} className="flex gap-3 text-[15px] leading-6 text-ink-800">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold-100 text-gold-700"><Check className="h-3.5 w-3.5" aria-hidden /></span>
                  {p}
                </li>
              ))}
            </ul>
          )}
          <ButtonLink
            to={`/contatti?oggetto=${encodeURIComponent('Consulenza sulle grafiche')}`}
            size="lg"
            className="mt-8 rounded-full"
            icon={<ArrowRight className="h-4 w-4" />}
          >
            Richiedi una consulenza
          </ButtonLink>
        </div>
      </Reveal>
    </section>
  )
}
