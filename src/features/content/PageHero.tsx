// Intestazione comune delle pagine istituzionali (Chi siamo, FAQ, Contatti): fascia scura con
// griglia sottile, alone oro e grana, come l'hero della home; titolo con l'ultima parola in corsivo.

import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { AccentTitle } from '@/components/fx/Reveal'
import { Grain } from '@/components/fx/ShaderBackdrop'

export function PageHero({ title, lead, children, aside, className }: {
  title: string
  lead?: ReactNode
  /** Contenuto sotto il testo (es. ricerca, scorciatoie). */
  children?: ReactNode
  /** Colonna destra su desktop (foto, recapiti…). */
  aside?: ReactNode
  className?: string
}) {
  return (
    <section data-surface="dark" className={cn('relative -mt-16 overflow-hidden bg-ink-950 text-white', className)}>
      <div aria-hidden className="bg-grid absolute inset-0 [mask-image:radial-gradient(90%_80%_at_20%_20%,#000_30%,transparent_80%)]" />
      <div aria-hidden className="absolute -left-40 -top-48 h-[34rem] w-[34rem] rounded-full bg-gold-500/20 blur-[120px]" />
      <div aria-hidden className="absolute -bottom-56 right-[-10rem] h-[30rem] w-[30rem] rounded-full bg-gold-700/15 blur-[120px]" />
      <Grain />
      <div className={cn('container relative pb-14 pt-28 sm:pb-20 sm:pt-36', !!aside && 'grid items-end gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,.85fr)] lg:gap-16')}>
        <div className="min-w-0">
          <h1 className="display-xl text-[clamp(2.4rem,9vw,5.2rem)] text-white [overflow-wrap:break-word]" style={{ fontStretch: '110%' }}>
            <AccentTitle text={title} animate accentClassName="text-gold-400" />
          </h1>
          {lead && <div className="mt-6 max-w-xl animate-slide-up text-base leading-7 text-ink-300 [animation-delay:.35s] sm:text-lg sm:leading-8">{lead}</div>}
          {children && <div className="mt-8 animate-slide-up [animation-delay:.5s]">{children}</div>}
        </div>
        {aside && <div className="min-w-0 animate-slide-up [animation-delay:.45s]">{aside}</div>}
      </div>
    </section>
  )
}
