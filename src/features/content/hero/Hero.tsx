import { lazy, Suspense, useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { publicUrl } from '@/lib/storage'
import { supportsWebGL } from '@/features/configurator/garment/webgl'
import { ShaderBackdrop, Grain } from '@/components/fx/ShaderBackdrop'
import { LiquidGlass } from '@/components/fx/LiquidGlass'
import { AccentTitle } from '@/components/fx/Reveal'
import type { HeroContent } from '../api'
import { paintJersey } from './jerseyDesigns'

const HeroJerseys = lazy(() => import('./HeroJerseys'))

/** Senza WebGL: le stesse maglie, in 2D. */
function JerseyStill() {
  const [urls, setUrls] = useState<string[]>([])
  useEffect(() => {
    let alive = true
    Promise.all([paintJersey('splash'), paintJersey('lupo')]).then((t) => {
      if (alive) setUrls(t.map((x) => x.front.toDataURL('image/webp', 0.9)))
    })
    return () => { alive = false }
  }, [])
  if (urls.length < 2) return null
  return (
    <div className="relative mx-auto aspect-[5/4] w-full max-w-xl animate-scene-in">
      <img src={urls[0]} alt="" className="absolute left-0 top-0 w-[62%] opacity-90" />
      <img src={urls[1]} alt="Maglie da gara personalizzate" className="absolute bottom-0 right-0 w-[70%] drop-shadow-[0_30px_40px_rgba(0,0,0,0.5)]" />
    </div>
  )
}

function HeroCta({ href, label, primary }: { href?: string; label?: string; primary?: boolean }) {
  if (!href || !label) return null
  const internal = href.startsWith('/')
  const cls = 'group inline-flex h-14 items-center gap-3 rounded-full pl-7 pr-2 text-[15px] font-semibold transition-transform active:scale-[.98]'
  const icon = (
    <span className={cn('flex h-10 w-10 items-center justify-center rounded-full transition-transform group-hover:translate-x-0.5', primary ? 'bg-ink-950 text-gold-400' : 'bg-white/15')}>
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

export function Hero({ hero }: { hero: HeroContent | null }) {
  const image = publicUrl(hero?.image_path)
  const [webgl] = useState(supportsWebGL)
  const [ready, setReady] = useState(false)
  const title = hero?.title ?? 'Divise e kit da gara personalizzati'

  return (
    <section
      data-surface="dark"
      className="relative mx-2 -mt-16 overflow-hidden rounded-b-[2rem] bg-ink-950 text-white sm:mx-3 sm:rounded-b-[2.5rem]"
    >
      <ShaderBackdrop />
      <Grain />
      {/* Velo per la leggibilità del testo sul lato sinistro */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_60%,rgba(8,8,10,.75),transparent_60%)]" />

      <div className="container relative grid items-center gap-2 pb-6 pt-28 sm:pb-14 lg:min-h-[min(100svh,58rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-6 lg:pt-24">
        <div className="relative z-10">
          <h1
            lang="it"
            className="display-xl text-[clamp(2rem,10vw,4rem)] text-white [overflow-wrap:break-word] lg:text-[clamp(3rem,5.2vw,5.6rem)]"
            style={{ fontStretch: '110%' }}
          >
            <AccentTitle text={title} animate accentClassName="text-gold-400" />
          </h1>
          {hero?.subtitle && (
            <p className="mt-7 max-w-lg animate-slide-up text-lg leading-8 text-ink-300 [animation-delay:.45s]">{hero.subtitle}</p>
          )}
          <div className="mt-10 flex animate-slide-up flex-wrap gap-3 [animation-delay:.6s]">
            <HeroCta primary href={hero?.cta_primary?.href ?? '/catalogo'} label={hero?.cta_primary?.label ?? 'Personalizza ora'} />
            <HeroCta href={hero?.cta_secondary?.href} label={hero?.cta_secondary?.label} />
          </div>
        </div>

        <div className="relative -mx-4 h-[min(92vw,30rem)] sm:mx-0 sm:h-[34rem] lg:h-[44rem]">
          {/* Alone dorato dietro le maglie */}
          <div aria-hidden className="absolute left-1/2 top-1/2 h-[70%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold-500/15 blur-[90px]" />
          {image ? (
            <img src={image} alt="" className="absolute inset-0 h-full w-full animate-scene-in rounded-[1.75rem] object-cover" fetchPriority="high" />
          ) : webgl ? (
            <Suspense fallback={null}>
              <HeroJerseys
                onReady={() => setReady(true)}
                className={cn('absolute inset-0 transition-[opacity,transform,filter] duration-[1400ms] ease-[cubic-bezier(.2,.75,.15,1)]', ready ? 'opacity-100 blur-0' : 'scale-95 opacity-0 blur-md')}
              />
            </Suspense>
          ) : (
            <JerseyStill />
          )}
        </div>
      </div>
      {/* Raccordo inferiore verso la pagina */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink-950/70 to-transparent" />
    </section>
  )
}
