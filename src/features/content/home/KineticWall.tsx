// "Personalizzazione": i punti del CMS diventano un muro di parole a tutta larghezza,
// righe alternate che scorrono in direzioni opposte seguendo lo scroll.

import { useRef } from 'react'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ButtonLink } from '@/components/ui/Button'
import { AccentTitle, Reveal } from '@/components/fx/Reveal'
import { useScrollProgress } from '@/components/fx/scroll'

const STYLES = [
  'text-ink-900',
  'text-transparent [-webkit-text-stroke:1.5px_theme(colors.ink.900)]',
  'font-serif font-normal normal-case italic text-gold-600 [font-stretch:100%]',
]

export function KineticWall({ title, text, points }: { title: string; text: string; points: string[] }) {
  const ref = useRef<HTMLElement>(null)
  useScrollProgress(ref)

  return (
    <section ref={ref} className="pt-20 sm:pt-32">
      <Reveal className="container grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,.8fr)] lg:items-end">
        <h2 className="display-lg text-[clamp(1.5rem,6.6vw,3rem)]"><AccentTitle text={title} accentClassName="text-gold-600" /></h2>
        <div>
          <p className="max-w-md text-lg leading-8 text-ink-600">{text}</p>
          <ButtonLink to="/catalogo" size="lg" className="mt-7 rounded-full" icon={<ArrowRight className="h-4 w-4" />}>Inizia a configurare</ButtonLink>
        </div>
      </Reveal>

      <ul className="sr-only">{points.map((p) => <li key={p}>{p}</li>)}</ul>
      <div aria-hidden className="mask-fade-x mt-12 space-y-1 overflow-hidden sm:mt-16">
        {points.map((p, i) => {
          const dir = i % 2 ? -1 : 1
          return (
            <div
              key={p}
              className="flex w-max gap-8 whitespace-nowrap will-change-transform motion-reduce:!transform-none"
              style={{ transform: `translateX(calc(${dir < 0 ? '-12vw' : '-38vw'} + (var(--p, .5) - .5) * ${dir * 34}vw))` }}
            >
              {[0, 1, 2].map((k) => (
                <span
                  key={k}
                  className={cn('flex items-center gap-8 font-display text-[clamp(2.2rem,7.4vw,6.5rem)] font-extrabold uppercase leading-[1.05]', STYLES[(i + k) % STYLES.length])}
                  style={{ fontStretch: '115%' }}
                >
                  {p}
                  <span className="inline-block h-3 w-3 shrink-0 rounded-full bg-gold-500 sm:h-4 sm:w-4" />
                </span>
              ))}
            </div>
          )
        })}
      </div>
    </section>
  )
}
