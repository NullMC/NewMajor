import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { publicUrl } from '@/lib/storage'
import { supportsWebGL } from '@/features/configurator/garment/webgl'
import { ShaderBackdrop, Grain } from '@/components/fx/ShaderBackdrop'
import { LiquidGlass } from '@/components/fx/LiquidGlass'
import { AccentTitle } from '@/components/fx/Reveal'
import type { HeroContent } from '../api'

const HeroRail = lazy(() => import('./HeroRail'))

/** Senza WebGL: le stesse maglie, ferme sull'asta. */
function RailStill() {
  return (
    <div className="relative flex h-full items-start justify-center gap-4 pt-10 sm:gap-8">
      <div aria-hidden className="absolute inset-x-0 top-10 h-1.5 rounded-full bg-gradient-to-b from-ink-500 to-ink-800" />
      <img src="/hero/splash-front.webp" alt="" className="relative mt-3 w-[42%] max-w-[17rem] -rotate-2 drop-shadow-[0_30px_40px_rgba(0,0,0,0.5)]" />
      <img src="/hero/lupo-front.webp" alt="Maglie da gara personalizzate" className="relative mt-3 w-[42%] max-w-[17rem] rotate-2 drop-shadow-[0_30px_40px_rgba(0,0,0,0.5)]" />
    </div>
  )
}

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

function useWide() {
  const query = '(min-width: 1024px)'
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide
}

export function Hero({ hero }: { hero: HeroContent | null }) {
  const image = publicUrl(hero?.image_path)
  const [webgl] = useState(supportsWebGL)
  const [ready, setReady] = useState(false)
  const wide = useWide()
  const anchorA = useRef<HTMLDivElement>(null)
  const anchorB = useRef<HTMLDivElement>(null)
  const anchors = useMemo(() => [anchorA, anchorB], [])
  const title = hero?.title ?? 'Divise e kit da gara personalizzati'
  // Su mobile e tablet le maglie fluttuano tra i contenuti (niente stender)
  const floating = !wide && !image
  const sceneClass = cn('absolute inset-0 transition-[opacity,filter] duration-[1400ms] ease-[cubic-bezier(.2,.75,.15,1)]', ready ? 'opacity-100 blur-0' : 'opacity-0 blur-md')

  const still = (src: string) => !webgl && <img src={src} alt="" className="h-full w-full object-contain drop-shadow-[0_24px_30px_rgba(0,0,0,0.5)]" />

  return (
    <section
      data-surface="dark"
      className="relative mx-2 -mt-16 flex flex-col overflow-hidden rounded-b-[2rem] bg-ink-950 text-white sm:mx-3 sm:rounded-b-[2.5rem]"
    >
      <ShaderBackdrop anchor={[0.5, 0.35]} />
      <Grain />
      {/* Velo per la leggibilità del testo sul lato sinistro */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_12%_62%,rgba(8,8,10,.8),transparent_58%)]" />

      {/* Scena 3D: da desktop metà destra con lo stender, su mobile dietro ai contenuti */}
      {floating ? (
        webgl && (
          <div className="absolute inset-0">
            <Suspense fallback={null}>
              <HeroRail anchors={anchors} onReady={() => setReady(true)} className={sceneClass} />
            </Suspense>
          </div>
        )
      ) : (
        <div className="relative order-2 h-[min(100vw,30rem)] lg:absolute lg:inset-y-0 lg:left-[44%] lg:right-0 lg:h-auto lg:pt-16">
          {image ? (
            <img src={image} alt="" className="absolute inset-0 h-full w-full animate-scene-in object-cover" fetchPriority="high" />
          ) : webgl ? (
            <Suspense fallback={null}>
              <HeroRail onReady={() => setReady(true)} className={sceneClass} />
            </Suspense>
          ) : (
            <RailStill />
          )}
        </div>
      )}

      <div className="container pointer-events-none relative z-10 order-1 flex items-center pb-10 pt-28 sm:pb-14 lg:min-h-[min(100svh,60rem)] lg:pb-24">
        <div className="relative w-full max-w-2xl lg:max-w-[min(46%,36rem)]">
          <h1
            lang="it"
            className="display-xl text-[clamp(2rem,10vw,4rem)] text-white [overflow-wrap:break-word] lg:text-[clamp(3rem,5vw,5.4rem)]"
            style={{ fontStretch: '110%' }}
          >
            <AccentTitle text={title} animate accentClassName="text-gold-400" />
          </h1>

          {/* Sottotitolo e prima maglia affiancati (solo mobile/tablet) */}
          <div className={cn('mt-6 sm:mt-8', floating && 'grid grid-cols-[minmax(0,1fr)_42%] items-center gap-3 sm:gap-6')}>
            {hero?.subtitle ? (
              <p className="max-w-lg animate-slide-up text-base leading-7 text-ink-300 [animation-delay:.45s] sm:text-lg sm:leading-8">{hero.subtitle}</p>
            ) : <span />}
            {floating && <div ref={anchorA} aria-hidden className="pointer-events-none aspect-[7/8]">{still('/hero/splash-front.webp')}</div>}
          </div>

          {/* Seconda maglia e pulsanti */}
          <div className={cn('mt-6 sm:mt-10', floating && 'grid grid-cols-[40%_minmax(0,1fr)] items-center gap-3 sm:gap-6')}>
            {floating && <div ref={anchorB} aria-hidden className="pointer-events-none aspect-[7/8]">{still('/hero/lupo-front.webp')}</div>}
            <div className={cn('pointer-events-auto flex animate-slide-up gap-3 [animation-delay:.6s]', floating ? 'flex-col items-start' : 'flex-wrap')}>
              <HeroCta primary href={hero?.cta_primary?.href ?? '/catalogo'} label={hero?.cta_primary?.label ?? 'Personalizza ora'} />
              <HeroCta href={hero?.cta_secondary?.href} label={hero?.cta_secondary?.label} />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
