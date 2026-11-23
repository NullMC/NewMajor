import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { publicUrl } from '@/lib/storage'
import { ShaderBackdrop, Grain } from '@/components/fx/ShaderBackdrop'
import { LiquidGlass } from '@/components/fx/LiquidGlass'
import { AccentTitle } from '@/components/fx/Reveal'
import type { HeroContent } from '../api'

function HeroCta({ href, label, primary }: { href?: string; label?: string; primary?: boolean }) {
  if (!href || !label) return null
  const internal = href.startsWith('/')
  const cls = 'group inline-flex h-12 items-center gap-2.5 whitespace-nowrap rounded-full pl-4 pr-1.5 text-sm font-semibold transition-transform active:scale-[.98] sm:h-14 sm:gap-3 sm:pl-7 sm:pr-2 sm:text-[15px]'
  const icon = (
    <span className={cn('flex h-9 w-9 items-center sm:h-10 sm:w-10 justify-center rounded-full transition-transform group-hover:translate-x-0.5', primary ? 'bg-ink-950 text-gold-400' : 'bg-white/15')}>
      <ArrowRight className="h-4 w-4" aria-hidden />
    </span>
  )
  if (primary) {
    const body = <>{label}{icon}</>
    const c = cn(cls, 'bg-gold-500 text-ink-950 shadow-[0_10px_40px_-10px_rgba(194,160,99,.7)] hover:bg-gold-400')
    return internal ? <Link to={href} className={c}>{body}</Link> : <a href={href} className={c}>{body}</a>
  }
  return internal
    ? <LiquidGlass as={Link} to={href} className={cls}>{label}{icon}</LiquidGlass>
    : <LiquidGlass as="a" href={href} className={cls}>{label}{icon}</LiquidGlass>
}

/** Foto predefinita dell'hero (sostituibile da Home e banner → Immagine hero). */
const DEFAULT_PHOTO = '/hero/showroom.webp'

export function Hero({ hero }: { hero: HeroContent | null }) {
  const photo = publicUrl(hero?.image_path) ?? DEFAULT_PHOTO
  const custom = !!hero?.image_path
  const title = hero?.title ?? 'Divise e kit da gara personalizzati'

  return (
    <section
      data-surface="dark"
      className="relative -mt-16 flex flex-col overflow-hidden bg-ink-950 text-white"
    >
      <ShaderBackdrop anchor={[0.22, 0.4]} />

      {/* Foto: su desktop occupa la parte destra e sfuma verso sinistra nello sfondo; su mobile sta sotto i testi e sfuma verso l'alto.
          La maschera è sul blocco intero (foto + velature), così il bordo che tocca lo sfondo è sempre trasparente. */}
      <div
        className={cn(
          'relative order-2 -mt-24 h-[min(125vw,36rem)] sm:-mt-32 lg:absolute lg:inset-y-0 lg:left-[36%] lg:right-0 lg:mt-0 lg:h-auto',
          '[mask-image:linear-gradient(to_bottom,transparent_0%,rgba(0,0,0,.5)_18%,#000_40%,#000_86%,transparent_100%)]',
          'lg:[mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,.12)_10%,rgba(0,0,0,.45)_24%,rgba(0,0,0,.82)_38%,#000_52%)]',
        )}
      >
        <img
          src={photo}
          alt={custom ? '' : 'Maglie e kit da gara personalizzati in esposizione'}
          fetchPriority="high"
          decoding="async"
          className={cn(
            'absolute inset-0 h-full w-full animate-scene-in object-cover [filter:saturate(.9)_brightness(.84)_contrast(1.06)]',
            !custom && 'object-[50%_58%] lg:object-[50%_52%]',
          )}
        />
        {/* Velature: tono scuro coerente con l'hero (sotto l'intestazione, in basso e ai bordi) */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(8,8,10,.6)_0%,transparent_24%,transparent_76%,rgba(8,8,10,.55)_100%)]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(130%_95%_at_68%_48%,transparent_50%,rgba(8,8,10,.5)_100%)]" />
      </div>

      <Grain />

      <div className="container pointer-events-none relative z-10 order-1 flex items-center pb-10 pt-28 sm:pb-14 lg:min-h-[min(100svh,60rem)] lg:pb-24">
        <div className="relative w-full max-w-2xl lg:max-w-[min(46%,36rem)]">
          <h1
            lang="it"
            className="display-xl text-[clamp(2rem,10vw,4rem)] text-white [overflow-wrap:break-word] lg:text-[clamp(3rem,5vw,5.4rem)]"
            style={{ fontStretch: '110%' }}
          >
            <AccentTitle text={title} animate accentClassName="text-gold-400" />
          </h1>
          {hero?.subtitle && (
            <p className="mt-6 max-w-lg animate-slide-up text-base leading-7 text-ink-300 [animation-delay:.45s] sm:mt-8 sm:text-lg sm:leading-8">{hero.subtitle}</p>
          )}
          <div className="pointer-events-auto mt-8 flex animate-slide-up flex-wrap gap-3 [animation-delay:.6s] sm:mt-10">
            <HeroCta primary href={hero?.cta_primary?.href ?? '/catalogo'} label={hero?.cta_primary?.label ?? 'Personalizza ora'} />
            <HeroCta href={hero?.cta_secondary?.href} label={hero?.cta_secondary?.label} />
          </div>
        </div>
      </div>
    </section>
  )
}
