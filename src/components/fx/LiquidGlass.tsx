// Liquid glass: superficie in vetro con rifrazione sui bordi.
//
// Ovunque: sfocatura + saturazione dello sfondo, bordo speculare e riflesso che segue
// il puntatore (classi .glass in index.css). Sui browser Chromium, che accettano un
// filtro SVG come backdrop-filter, si aggiunge una mappa di spostamento calcolata sulla
// forma reale dell'elemento (rettangolo arrotondato): il contenuto dietro ai bordi viene
// "piegato" verso l'interno come attraverso una lente spessa.

import { useEffect, useId, useRef, useState, type ComponentPropsWithoutRef, type ElementType, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

type NavigatorUA = Navigator & { userAgentData?: { brands?: { brand: string }[] } }

export const supportsRefraction = (() => {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  const brands = (navigator as NavigatorUA).userAgentData?.brands ?? []
  if (!brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b.brand))) return false
  return !window.matchMedia('(prefers-reduced-transparency: reduce)').matches
})()

const mapCache = new Map<string, string>()

/** Mappa di spostamento (R = x, G = y; 128 = neutro) per un rettangolo arrotondato. */
function displacementMap(w: number, h: number, radius: number, bezel: number) {
  const key = `${w}x${h}r${radius}b${bezel}`
  const hit = mapCache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) return ''
  const img = ctx.createImageData(w, h)
  const d = img.data
  const r = Math.min(radius, w / 2, h / 2)
  const hw = w / 2, hh = h / 2
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - hw, py = y + 0.5 - hh
      const qx = Math.abs(px) - (hw - r), qy = Math.abs(py) - (hh - r)
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0)
      const sd = Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r
      const dist = -sd
      let nx = 0, ny = 0
      if (dist >= 0 && dist < bezel) {
        // Normale uscente dal bordo più vicino
        if (qx > 0 && qy > 0) {
          const l = Math.hypot(qx, qy) || 1
          nx = (qx / l) * Math.sign(px)
          ny = (qy / l) * Math.sign(py)
        } else if (qx > qy) nx = Math.sign(px)
        else ny = Math.sign(py)
        // Profilo convesso: nullo al centro, massimo sul bordo
        const t = 1 - dist / bezel
        const mag = t * t * (3 - 2 * t)
        nx *= -mag
        ny *= -mag
      }
      const i = (y * w + x) * 4
      d[i] = 128 + nx * 127
      d[i + 1] = 128 + ny * 127
      d[i + 2] = 128
      d[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const url = c.toDataURL()
  if (mapCache.size > 40) mapCache.clear()
  mapCache.set(key, url)
  return url
}

type Tone = 'clear' | 'light' | 'dark'

type LiquidGlassProps<T extends ElementType> = {
  as?: T
  tone?: Tone
  /** Larghezza della fascia di rifrazione in px. */
  bezel?: number
  /** Intensità dello spostamento (px massimi = bezel * strength / 2). */
  strength?: number
  blur?: number
  className?: string
  children?: ReactNode
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>

const TONE: Record<Tone, string> = { clear: 'glass-clear', light: 'glass-light', dark: 'glass-dark' }

export function LiquidGlass<T extends ElementType = 'div'>({
  as, tone = 'clear', bezel = 16, strength = 1.6, blur = 6, className, style, children, ...rest
}: LiquidGlassProps<T>) {
  const Tag = (as ?? 'div') as ElementType
  const ref = useRef<HTMLElement>(null)
  const filterId = `lg${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const [map, setMap] = useState<{ url: string; w: number; h: number } | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!supportsRefraction || !el) return
    let raf = 0
    const build = () => {
      const w = Math.round(el.offsetWidth)
      const h = Math.round(el.offsetHeight)
      if (!w || !h || w * h > 1_400_000) return setMap(null)
      const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0
      const url = displacementMap(w, h, radius, bezel)
      setMap((m) => (m && m.url === url ? m : { url, w, h }))
    }
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(build)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [bezel])

  const filter = map ? `url(#${filterId})` : undefined
  return (
    <Tag
      ref={ref}
      className={cn('glass', TONE[tone], className)}
      style={filter ? { ...(style as object), backdropFilter: filter, WebkitBackdropFilter: filter } : style}
      {...rest}
    >
      {map && (
        <svg aria-hidden width="0" height="0" className="pointer-events-none absolute" focusable="false">
          <filter id={filterId} x="0" y="0" width={map.w} height={map.h} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="blur" />
            <feImage href={map.url} x="0" y="0" width={map.w} height={map.h} preserveAspectRatio="none" result="map" />
            <feDisplacementMap in="blur" in2="map" scale={bezel * strength} xChannelSelector="R" yChannelSelector="G" result="refract" />
            <feColorMatrix in="refract" type="saturate" values="1.7" />
          </filter>
        </svg>
      )}
      {children}
    </Tag>
  )
}
