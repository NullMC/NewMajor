// Portfolio dei progetti realizzati: i post delle squadre come polaroid aperte a ventaglio.
// Il post al centro si apre come una pagina doppia di un diario (foto a sinistra, note a
// destra); gli altri si allontanano in profondità ruotando, e quelli più lontani si
// allargano leggermente come visti attraverso un grandangolo. Trascina, usa le frecce o
// la tastiera; scorre da solo finché non lo tocchi.

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { publicUrl } from '@/lib/storage'
import type { PortfolioPost } from '@/types/db'
import { AccentTitle, Reveal } from '@/components/fx/Reveal'
import { Grain, ShaderBackdrop } from '@/components/fx/ShaderBackdrop'
import { PLATFORM_LABEL } from '../api'

const AUTOPLAY_MS = 5200
const EASE = 'cubic-bezier(.2,.75,.15,1)'
const SPRING = 'cubic-bezier(.34,1.45,.64,1)' // apertura "elastica" al primo ingresso

const pad = (n: number) => String(n).padStart(2, '0')
const formatDate = (d: string | null) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : null
const altFor = (p: PortfolioPost) => p.image_alt || `Divisa realizzata per ${p.team_name}`

function useStage() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return { ref, w }
}

function PostMeta({ post, light }: { post: PortfolioPost; light?: boolean }) {
  const date = formatDate(post.posted_on)
  const meta = [date, post.platform ? PLATFORM_LABEL[post.platform] : null].filter(Boolean).join(' · ')
  return (
    <>
      {meta && <p className={cn('font-mono text-2xs uppercase tracking-[.18em]', light ? 'text-ink-400' : 'text-ink-500')}>{meta}</p>}
      {post.post_url && (
        <a
          href={post.post_url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'group/link inline-flex items-center gap-2 text-sm font-semibold underline-offset-4 hover:underline',
            light ? 'text-gold-400' : 'text-ink-900',
          )}
        >
          Vedi il post{post.platform && post.platform !== 'altro' ? ` su ${PLATFORM_LABEL[post.platform]}` : ''}
          <ArrowUpRight className="h-4 w-4 transition-transform group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5" aria-hidden />
        </a>
      )}
    </>
  )
}

export function PortfolioShowcase({ title, text, posts }: { title: string; text?: string; posts: PortfolioPost[] }) {
  const n = posts.length
  const loop = n >= 5
  const { ref: stageRef, w } = useStage()
  const section = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(0) // indice (anche frazionario durante il trascinamento)
  const [dragging, setDragging] = useState(false)
  const [entered, setEntered] = useState(false)
  const [inView, setInView] = useState(false)
  const [touched, setTouched] = useState(false)
  const [hover, setHover] = useState(false)
  const drag = useRef<{ x: number; start: number; last: number; moved: boolean; id: number } | null>(null)
  const justDragged = useRef(false) // evita che il rilascio di un trascinamento valga come clic

  const wide = w >= 720
  const cardW = wide ? Math.min(320, w * 0.29) : Math.min(290, w * 0.7)
  const photoH = cardW * 1.25
  const cardH = photoH + cardW * 0.05 + 52
  const active = ((Math.round(pos) % n) + n) % n
  const post = posts[active]

  const clampPos = useCallback((p: number) => (loop ? p : Math.max(0, Math.min(n - 1, p))), [loop, n])
  const go = useCallback((p: number) => setPos(clampPos(Math.round(p))), [clampPos])
  const step = (dir: number) => { setTouched(true); go(Math.round(pos) + dir) }

  // Ingresso a ventaglio e pausa fuori schermo
  useEffect(() => {
    const el = section.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      setInView(e.isIntersecting)
      if (e.isIntersecting) setEntered(true)
    }, { threshold: 0.25 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Avanzamento automatico finché l'utente non interagisce
  useEffect(() => {
    if (n < 2 || touched || hover || !inView || dragging) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = window.setInterval(() => {
      if (document.hidden) return
      setPos((p) => (loop ? Math.round(p) + 1 : (Math.round(p) + 1) % n))
    }, AUTOPLAY_MS)
    return () => window.clearInterval(t)
  }, [n, loop, touched, hover, inView, dragging])

  // Distanza dal centro (con giro continuo da 5 post in su)
  const offsetOf = (i: number) => {
    let d = i - pos
    if (loop) d = ((((d + n / 2) % n) + n) % n) - n / 2
    return d
  }

  const cardStyle = (i: number): CSSProperties => {
    const d = offsetOf(i)
    const a = Math.abs(d)
    const s = Math.sign(d)
    const transition = dragging ? 'none' : `transform 900ms ${entered ? EASE : SPRING}, opacity 600ms ${EASE}, filter 600ms ${EASE}`
    if (!entered) {
      return { transform: `translate3d(-50%, 30px, -200px) rotate(${d * 3}deg) scale(.86)`, opacity: 0, transition }
    }
    // centro: sul desktop la foto è la pagina sinistra della doppia pagina
    const spread = wide ? cardW * 0.5 * Math.max(0, 1 - a) : 0
    const near = Math.min(a, 1)
    const gap = wide ? cardW * 1.08 : cardW * 0.62
    const x = s * (near * gap + Math.max(0, a - 1) * cardW * (wide ? 0.42 : 0.3)) - spread
    const y = a * a * (wide ? 12 : 8)
    const rz = d * (wide ? 5 : 6)
    const ry = -s * Math.min(a, 1.4) * 26
    const z = -a * (wide ? 150 : 110)
    const warp = 1 + Math.min(a, 2.5) * 0.045 // "grandangolo": i lati si allargano
    return {
      transform: `translate3d(calc(-50% + ${x}px), ${y}px, ${z}px) rotateY(${ry}deg) rotate(${rz}deg) scaleX(${warp})`,
      opacity: a > (wide ? 3.2 : 2.2) ? 0 : 1 - Math.max(0, a - 0.6) * 0.22,
      filter: `brightness(${1 - Math.min(a, 3) * 0.16}) saturate(${1 - Math.min(a, 3) * 0.12})`,
      zIndex: 100 - Math.round(a * 10),
      transition,
    }
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1) }
  }

  return (
    <section className="container pt-20 sm:pt-28 lg:pt-32" aria-labelledby="portfolio">
      <Reveal className="overflow-hidden rounded-[2rem] bg-ink-950 text-white">
        <div ref={section} data-surface="dark" className="relative px-4 py-12 sm:px-10 sm:py-16 lg:px-16">
          <ShaderBackdrop palette="deep" anchor={[0.5, 0.2]} />
          <Grain />

          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl">
              <h2 id="portfolio" className="display-lg text-[clamp(1.5rem,6.6vw,3rem)] text-white"><AccentTitle text={title} accentClassName="text-gold-400" /></h2>
              {text && <p className="mt-4 max-w-xl text-lg leading-8 text-ink-300">{text}</p>}
            </div>
            {n > 1 && (
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm tabular-nums text-ink-400" aria-hidden>
                  <span className="text-white">{pad(active + 1)}</span> / {pad(n)}
                </span>
                <button type="button" onClick={() => step(-1)} disabled={!loop && active === 0} className="glass glass-dark flex h-11 w-11 items-center justify-center rounded-full transition hover:text-gold-400 disabled:opacity-30" aria-label="Post precedente">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => step(1)} disabled={!loop && active === n - 1} className="glass glass-dark flex h-11 w-11 items-center justify-center rounded-full transition hover:text-gold-400 disabled:opacity-30" aria-label="Post successivo">
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Palco 3D */}
          <div
            ref={stageRef}
            role="region"
            aria-roledescription="carosello"
            aria-label={title}
            tabIndex={0}
            onKeyDown={onKey}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            className="relative -mx-4 mt-10 touch-pan-y select-none rounded-3xl outline-none sm:-mx-10 lg:-mx-16 [perspective:1600px] focus-visible:ring-2 focus-visible:ring-gold-400/60 sm:mt-14"
            style={{ height: w ? cardH + (wide ? 70 : 40) : undefined, minHeight: w ? undefined : '28rem' }}
            onPointerDown={(e) => {
              if (e.button !== 0) return
              drag.current = { x: e.clientX, start: pos, last: pos, moved: false, id: e.pointerId }
            }}
            onPointerMove={(e) => {
              const g = drag.current
              if (!g) return
              const dx = e.clientX - g.x
              if (!g.moved && Math.abs(dx) > 6) {
                g.moved = true
                setDragging(true)
                setTouched(true)
                try { (e.currentTarget as HTMLElement).setPointerCapture(g.id) } catch { /* puntatore già rilasciato */ }
              }
              if (g.moved) { g.last = clampPos(g.start - dx / (cardW * (wide ? 0.95 : 0.8))); setPos(g.last) }
            }}
            onPointerUp={() => {
              const g = drag.current
              drag.current = null
              if (!g?.moved) return
              justDragged.current = true
              setTimeout(() => { justDragged.current = false }, 0)
              setDragging(false)
              go(g.last)
            }}
            onPointerCancel={() => { const g = drag.current; drag.current = null; setDragging(false); if (g) go(g.last) }}
          >
            <div className="absolute inset-0 [transform-style:preserve-3d]">
              {posts.map((p, i) => {
                const d = offsetOf(i)
                const isActive = Math.abs(d) < 0.5
                const url = publicUrl(p.image_path)
                return (
                  <div
                    key={p.id}
                    role="group"
                    aria-roledescription="post"
                    aria-label={`${i + 1} di ${n}: ${p.team_name}`}
                    inert={!isActive}
                    className="absolute left-1/2 top-4 [transform-style:preserve-3d]"
                    style={{ width: cardW, ...cardStyle(i) }}
                    onClick={() => { if (!isActive && !justDragged.current) { setTouched(true); go(pos + d) } }}
                  >
                    {/* Pagina destra della doppia pagina (solo desktop, solo post attivo) */}
                    {wide && (
                      <div
                        className="absolute left-full top-0 origin-left [backface-visibility:hidden] [transform-style:preserve-3d]"
                        style={{
                          width: cardW, height: cardH,
                          transform: `rotateY(${isActive && !dragging ? 0 : -172}deg)`,
                          opacity: isActive ? 1 : 0,
                          transition: `transform 900ms ${EASE}, opacity 400ms ${EASE} ${isActive ? '0ms' : '450ms'}`,
                        }}
                      >
                        <div className="relative flex h-full flex-col overflow-hidden rounded-r-md bg-[#F3F1EA] p-6 lg:p-7 text-ink-900 shadow-[0_30px_60px_-30px_rgba(0,0,0,.7)] [background-image:repeating-linear-gradient(transparent_0_27px,rgba(14,14,16,.035)_27px_28px)]">
                          {/* piega centrale */}
                          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-ink-900/15 to-transparent" />
                          <span aria-hidden className="absolute -top-3 right-8 h-7 w-20 rotate-[5deg] bg-gold-200/80 shadow-sm" />
                          <p className="font-mono text-2xs tabular-nums tracking-[.2em] text-ink-500">{pad(i + 1)} / {pad(n)}</p>
                          <p className="mt-4 line-clamp-2 shrink-0 font-serif text-[clamp(1.6rem,2.6vw,2.1rem)] italic leading-[1.05] text-ink-900">{p.team_name}</p>
                          {p.title && <p className="mt-3 shrink-0 font-display text-base font-bold uppercase leading-snug" style={{ fontStretch: '112%' }}>{p.title}</p>}
                          {p.caption && <p className="mask-fade-b mt-3 min-h-0 flex-1 overflow-hidden text-sm leading-6 text-ink-600">{p.caption}</p>}
                          <div className="mt-auto shrink-0 space-y-2.5 border-t border-ink-900/10 pt-4"><PostMeta post={p} /></div>
                        </div>
                      </div>
                    )}

                    {/* Polaroid */}
                    <figure
                      className={cn(
                        'relative bg-[#F3F1EA] p-[5%] pb-0 shadow-[0_40px_70px_-30px_rgba(0,0,0,.85)] transition-shadow duration-700',
                        wide ? 'rounded-l-md rounded-r-sm' : 'rounded-md',
                        isActive && 'shadow-[0_40px_70px_-30px_rgba(0,0,0,.85),0_0_0_1px_rgba(194,160,99,.45),0_0_60px_-10px_rgba(194,160,99,.35)]',
                        !isActive && 'cursor-pointer',
                      )}
                      style={{ height: cardH }}
                    >
                      <span aria-hidden className="absolute -top-3 left-1/2 h-7 w-24 -translate-x-1/2 -rotate-3 bg-white/60 shadow-sm backdrop-blur-[1px]" />
                      <div className="overflow-hidden bg-ink-800" style={{ height: photoH }}>
                        {url && <img src={url} alt={altFor(p)} loading="lazy" decoding="async" draggable={false} className="h-full w-full object-cover" />}
                      </div>
                      <figcaption className="flex h-[52px] items-center justify-between gap-3 text-ink-900">
                        <span className="truncate font-serif text-xl italic">{p.team_name}</span>
                        <span className="shrink-0 font-mono text-2xs tabular-nums text-ink-500">{pad(i + 1)}</span>
                      </figcaption>
                    </figure>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Note del post attivo sotto il palco (mobile e tablet) */}
          {!wide && post && (
            <div key={post.id} className="relative mt-6 animate-slide-up text-center" aria-live="polite">
              {post.title && <p className="font-display text-base font-bold uppercase" style={{ fontStretch: '112%' }}>{post.title}</p>}
              {post.caption && <p className="mx-auto mt-2 line-clamp-4 max-w-md text-[15px] leading-7 text-ink-300">{post.caption}</p>}
              <div className="mt-4 flex flex-col items-center gap-3"><PostMeta post={post} light /></div>
            </div>
          )}
          {wide && <p className="sr-only" aria-live="polite">{post ? `${post.team_name}, ${active + 1} di ${n}` : ''}</p>}
        </div>
      </Reveal>
    </section>
  )
}
