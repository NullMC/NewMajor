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
      // raggio d'influenza proporzionale al corpo del testo: si deformano la lettera sotto il puntatore e poco più
      const radius = parseFloat(getComputedStyle(el).fontSize) * 1.5
      letters.forEach((l, i) => {
        const r = l.getBoundingClientRect()
        const d = Math.hypot(mx - (r.left + r.width / 2), (my - (r.top + r.height / 2)) * 0.5)
        const target = Math.max(0, 1 - d / radius) ** 1.6
        cur[i] += (target - cur[i]) * 0.16
        if (Math.abs(target - cur[i]) > 0.002) moving = true
        l.style.fontVariationSettings = `"wdth" ${72 + cur[i] * 53}`
        l.style.transform = `scaleY(${1 + cur[i] * 0.22})`
      })
      // se le lettere allargate superano la riga, la riga si stringe quanto basta per restare intera
      const last = letters[letters.length - 1]
      const used = last ? last.offsetLeft + last.offsetWidth - el.offsetLeft : 0
      el.style.transform = used > el.clientWidth ? `scaleX(${el.clientWidth / used})` : ''
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
    // ogni lettera è un elemento a sé distribuito sulla larghezza: si deforma singolarmente
    <div ref={ref} aria-hidden className={cn('flex origin-left select-none justify-between font-display font-black uppercase leading-[.78]', className)}>
      {Array.from(text).map((ch, i) =>
        ch === ' ' ? <span key={i} className="w-[.42em] shrink-0" /> : (
          <span key={i} data-l="" className={cn('inline-block origin-bottom', letterClassName)} style={{ fontVariationSettings: '"wdth" 72' }}>{ch}</span>
        ),
      )}
    </div>
  )
}
