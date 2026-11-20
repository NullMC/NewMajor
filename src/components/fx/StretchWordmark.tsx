// Marchio a tutta larghezza: le lettere si allargano e si allungano verso il puntatore
// (asse di larghezza variabile di Archivo). Senza puntatore resta fermo.

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'

export function StretchWordmark({ text, className, letterClassName }: { text: string; className?: string; letterClassName?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || !window.matchMedia('(pointer: fine)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const letters = Array.from(el.querySelectorAll<HTMLSpanElement>('[data-l]'))
    const cur = letters.map(() => 0)
    let mx = -1e5, my = -1e5, raf = 0
    const tick = () => {
      raf = 0
      let moving = false
      letters.forEach((l, i) => {
        const r = l.getBoundingClientRect()
        const d = Math.hypot(mx - (r.left + r.width / 2), (my - (r.top + r.height / 2)) * 0.5)
        const target = Math.max(0, 1 - d / 420) ** 1.6
        cur[i] += (target - cur[i]) * 0.16
        if (Math.abs(target - cur[i]) > 0.002) moving = true
        l.style.fontVariationSettings = `"wdth" ${72 + cur[i] * 53}`
        l.style.transform = `scaleY(${1 + cur[i] * 0.22})`
      })
      if (moving) raf = requestAnimationFrame(tick)
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick) }
    const move = (e: PointerEvent) => { mx = e.clientX; my = e.clientY; kick() }
    const leave = () => { mx = my = -1e5; kick() }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
    }
  }, [text])

  return (
    <div ref={ref} aria-hidden className={cn('flex select-none justify-between gap-[.2em] font-display font-black uppercase leading-[.78]', className)}>
      {text.split(/\s+/).map((word, w) => (
        <span key={w} className="flex">
          {Array.from(word).map((ch, i) => (
            <span key={i} data-l="" className={cn('inline-block origin-bottom', letterClassName)} style={{ fontVariationSettings: '"wdth" 72' }}>{ch}</span>
          ))}
        </span>
      ))}
    </div>
  )
}
