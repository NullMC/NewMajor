import { useEffect, type RefObject } from 'react'

/**
 * Avanzamento dello scroll attraverso un elemento (0 quando il bordo superiore
 * tocca `start` del viewport, 1 quando il bordo inferiore arriva a `end`).
 * Scrive il valore nella variabile CSS `--p` dell'elemento e lo passa a `onChange`,
 * senza rirenderizzare React.
 */
export function useScrollProgress(
  ref: RefObject<HTMLElement | null>,
  onChange?: (p: number) => void,
  { start = 0, end = 1 }: { start?: number; end?: number } = {},
) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    let visible = false
    const update = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight
      const from = vh * (1 - start)
      const total = r.height + vh * (1 - start) - vh * (1 - end)
      const p = Math.min(1, Math.max(0, (from - r.top) / Math.max(1, total)))
      el.style.setProperty('--p', p.toFixed(4))
      onChange?.(p)
    }
    const schedule = () => {
      if (visible && !raf) raf = requestAnimationFrame(update)
    }
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      update()
    })
    io.observe(el)
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    update()
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [ref, onChange, start, end])
}
