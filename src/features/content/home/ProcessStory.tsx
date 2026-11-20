// "Come funziona" raccontato con lo scroll: la sezione resta ferma mentre si scorre,
// un indicatore verticale avanza e i passaggi si alternano con una maschera.

import { useCallback, useRef, useState, type CSSProperties } from 'react'
import { cn } from '@/lib/cn'
import { AccentTitle } from '@/components/fx/Reveal'
import { useScrollProgress } from '@/components/fx/scroll'

const TICKS = 36

export function ProcessStory({ title, steps }: { title: string; steps: { title: string; text: string }[] }) {
  const ref = useRef<HTMLElement>(null)
  const [active, setActive] = useState(0)
  const n = steps.length
  const onProgress = useCallback((p: number) => setActive(Math.min(n - 1, Math.floor(p * n * 0.9999))), [n])
  useScrollProgress(ref, onProgress, { start: 1, end: 0 })

  return (
    <section
      ref={ref}
      aria-labelledby="process"
      className="relative mt-4 h-[calc(var(--n)*55svh+40svh)] sm:mt-8 sm:h-[calc(var(--n)*65svh+45svh)]"
      style={{ '--n': n } as CSSProperties}
    >
      {/* su mobile il contenuto parte dall'alto (niente vuoto sopra il titolo), da tablet in su è centrato */}
      <div className="sticky top-0 flex h-[100svh] flex-col justify-start overflow-hidden pt-24 sm:justify-center sm:pt-16">
        <div className="container">
          <h2 id="process" className="display-lg text-[clamp(1.5rem,6.6vw,3rem)]"><AccentTitle text={title} accentClassName="text-gold-600" /></h2>

          <div className="mt-8 grid grid-cols-[auto_minmax(0,1fr)] gap-6 sm:mt-12 sm:gap-14">
            {/* Indicatore */}
            <div className="flex flex-col items-center gap-3" aria-hidden>
              <span className="font-mono text-xs tabular-nums text-ink-500">{String(active + 1).padStart(2, '0')}</span>
              <div className="relative flex h-[min(46svh,22rem)] w-8 flex-col justify-between">
                {Array.from({ length: TICKS }, (_, i) => (
                  <span key={i} className={cn('h-px self-center bg-ink-900/25', i % 9 === 0 ? 'w-8 bg-ink-900/50' : 'w-3')} />
                ))}
                <span className="absolute left-1/2 top-0 w-[2px] -translate-x-1/2 rounded-full bg-gold-500" style={{ height: 'calc(var(--p, 0) * 100%)' }} />
                <span
                  className="absolute left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold-500 ring-4 ring-gold-500/20"
                  style={{ top: 'calc(var(--p, 0) * 100%)' }}
                />
              </div>
              <span className="font-mono text-xs tabular-nums text-ink-400">{String(n).padStart(2, '0')}</span>
            </div>

            {/* Passaggi */}
            <ol className="relative min-h-[min(46svh,22rem)]">
              {steps.map((s, i) => (
                <li
                  key={s.title}
                  aria-current={i === active ? 'step' : undefined}
                  className={cn(
                    'absolute inset-0 flex flex-col justify-center transition-[opacity,transform,clip-path] duration-700 ease-[cubic-bezier(.2,.75,.15,1)]',
                    i === active ? 'opacity-100 [clip-path:inset(0_0_0_0)]' : i < active ? '-translate-y-8 opacity-0 [clip-path:inset(0_0_100%_0)]' : 'translate-y-8 opacity-0 [clip-path:inset(100%_0_0_0)]',
                  )}
                >
                  <span className="font-serif text-[clamp(4rem,14vw,9rem)] italic leading-[.8] text-gold-600">{String(i + 1).padStart(2, '0')}</span>
                  <p className="mt-6 max-w-xl font-display text-[clamp(1.4rem,4.4vw,2.4rem)] font-bold uppercase leading-tight" style={{ fontStretch: '112%' }}>{s.title}</p>
                  <p className="mt-4 max-w-lg text-[15px] leading-7 text-ink-600 sm:text-lg sm:leading-8">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>

          {/* Titoli dei passaggi */}
          <div className="mt-10 hidden gap-6 border-t border-ink-900/10 pt-5 sm:grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-hidden>
            {steps.map((s, i) => (
              <p key={s.title} className={cn('font-mono text-xs uppercase tracking-wider transition-colors duration-500', i === active ? 'text-ink-900' : 'text-ink-400')}>
                <span className={cn('mr-2', i <= active ? 'text-gold-600' : '')}>{String(i + 1).padStart(2, '0')}</span>{s.title}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
