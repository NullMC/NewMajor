import { useEffect, useRef, type ElementType, type ReactNode, type CSSProperties } from 'react'
import { cn } from '@/lib/cn'

/** Rivela il contenuto con una maschera quando entra nel viewport. */
export function Reveal({ as, delay = 0, className, children }: { as?: ElementType; delay?: number; className?: string; children: ReactNode }) {
  const Tag = as ?? 'div'
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') return el.classList.add('is-in')
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        el.classList.add('is-in')
        io.disconnect()
      }
    }, { rootMargin: '0px 0px -12% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <Tag ref={ref} data-reveal="" className={className} style={delay ? ({ '--reveal-delay': `${delay}ms` } as CSSProperties) : undefined}>
      {children}
    </Tag>
  )
}

/**
 * Titolo con l'ultima parola in corsivo serif. Con `animate` ogni parola sale da una
 * maschera, in sequenza.
 */
export function AccentTitle({ text, animate, accentClassName, delay = 0 }: { text: string; animate?: boolean; accentClassName?: string; delay?: number }) {
  const words = text.trim().split(/\s+/)
  return (
    <>
      {words.map((w, i) => {
        const last = i === words.length - 1 && words.length > 1
        const inner = <span className={cn(last && cn('accent-serif', accentClassName))}>{w}</span>
        return (
          <span key={i}>
            {animate ? (
              <span className="inline-block overflow-hidden pb-[0.08em] align-bottom">
                <span className="inline-block animate-word-up motion-reduce:animate-none" style={{ animationDelay: `${delay + i * 70}ms` }}>{inner}</span>
              </span>
            ) : inner}
            {i < words.length - 1 ? ' ' : ''}
          </span>
        )
      })}
    </>
  )
}
