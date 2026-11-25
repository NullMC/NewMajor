// "Chi siamo": testi dalla pagina CMS chi-siamo (titolo, estratto, contenuto Markdown), impaginati
// come intestazione con collage di foto reali (portfolio o prodotti), una griglia "bento" con
// l'introduzione, una scheda per ogni sezione "## …" del contenuto e i numeri del catalogo
// letti dal database, e le call to action finali come in home.

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Box, Images, LayoutGrid, Phone, Quote } from 'lucide-react'
import { cn } from '@/lib/cn'
import { publicUrl } from '@/lib/storage'
import { stripMarkdown } from '@/lib/markdown'
import { useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { Skeleton } from '@/components/ui/Display'
import { Markdown } from '@/components/ui/Markdown'
import { ButtonLink } from '@/components/ui/Button'
import { AccentTitle, Reveal } from '@/components/fx/Reveal'
import { Grain } from '@/components/fx/ShaderBackdrop'
import { useSettings } from '@/features/settings/SettingsProvider'
import { listCategories, listFeatured, listProducts, primaryImage } from '@/features/catalog/api'
import { getPage, listPortfolio } from './api'
import { PageHero } from './PageHero'
import NotFoundPage from './NotFoundPage'

/** Divide il Markdown in introduzione (prima del primo titolo ##) e sezioni. */
function splitSections(md: string) {
  const parts = md.replace(/\r\n/g, '\n').split(/^##\s+(.+)$/m)
  const intro = parts[0].trim()
  const sections: { title: string; body: string }[] = []
  for (let i = 1; i < parts.length; i += 2) sections.push({ title: parts[i].trim(), body: (parts[i + 1] ?? '').trim() })
  return { intro, sections }
}

/** Numero che sale fino al valore quando entra nel viewport. */
function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [n, setN] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof IntersectionObserver === 'undefined') { setN(value); return }
    let raf = 0
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      const t0 = performance.now()
      const tick = (t: number) => {
        const k = Math.min(1, (t - t0) / 1100)
        setN(Math.round(value * (1 - (1 - k) ** 3)))
        if (k < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    })
    io.observe(el)
    return () => { io.disconnect(); cancelAnimationFrame(raf) }
  }, [value])
  return <span ref={ref} className="tabular-nums">{n}</span>
}

type Photo = { src: string; alt: string; caption: string }

/** Posizioni del collage (desktop): polaroid sparse e leggermente ruotate attorno al centro. */
const SLOTS = [
  'left-[2%] top-[4%] w-[40%] -rotate-6',
  'right-[1%] top-0 w-[37%] rotate-[5deg]',
  'left-[27%] top-[30%] w-[41%] rotate-2 z-10',
  'right-[4%] bottom-0 w-[34%] -rotate-3',
  'left-0 bottom-[2%] w-[31%] rotate-[7deg]',
]

/** Foto come nel portfolio della home: polaroid color carta con striscia di nastro adesivo. */
function Polaroid({ photo, eager, className }: { photo: Photo; eager?: boolean; className?: string }) {
  return (
    <figure className={cn('relative rounded-md bg-[#F3F1EA] p-[5%] pb-0 shadow-[0_40px_70px_-30px_rgba(0,0,0,.85)]', className)}>
      <span aria-hidden className="absolute -top-3 left-1/2 z-10 h-7 w-[46%] -translate-x-1/2 -rotate-3 bg-white/60 shadow-sm backdrop-blur-[1px]" />
      <div className="aspect-[4/5] overflow-hidden bg-ink-800">
        <img src={photo.src} alt={photo.alt} loading={eager ? 'eager' : 'lazy'} decoding="async" draggable={false} className="h-full w-full object-cover" />
      </div>
      <figcaption className="truncate py-2.5 font-serif text-lg italic leading-none text-ink-900 sm:py-3">{photo.caption}</figcaption>
    </figure>
  )
}

function PhotoCollage({ photos }: { photos: Photo[] }) {
  if (!photos.length) return null
  return (
    <>
      {/* Desktop: polaroid sparse */}
      <div className="relative hidden aspect-[10/9] lg:block">
        {photos.slice(0, SLOTS.length).map((p, i) => (
          <div key={p.src} className={cn('absolute transition duration-500 hover:z-20 hover:rotate-0 hover:scale-[1.04]', SLOTS[i])}>
            <Polaroid photo={p} eager />
          </div>
        ))}
      </div>
      {/* Mobile e tablet: polaroid in una striscia scorrevole */}
      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 pt-4 lg:hidden">
        {photos.map((p, i) => (
          <Polaroid key={p.src} photo={p} className={cn('w-[52vw] max-w-[15rem] shrink-0 snap-start', i % 2 ? 'rotate-2' : '-rotate-2')} />
        ))}
      </div>
    </>
  )
}

/** Contenuto dell'intestazione come citazione: virgolette, testo in corsivo che compare parola per parola e firma. */
function HeroQuote({ text, author }: { text: string; author: string }) {
  const words = text.trim().split(/\s+/)
  return (
    <figure className="max-w-xl">
      <Quote className="h-9 w-9 fill-gold-500 text-gold-500" aria-hidden />
      <blockquote className="mt-4 font-serif text-[clamp(1.45rem,3.2vw,2.1rem)] italic leading-[1.25] text-white">
        <p>
          {words.map((w, i) => (
            <Fragment key={i}>
              <span className="inline-block animate-blur-in motion-reduce:animate-none" style={{ animationDelay: `${450 + i * 45}ms` }}>{w}</span>
              {i < words.length - 1 ? ' ' : ''}
            </Fragment>
          ))}
        </p>
      </blockquote>
      <figcaption className="mt-7 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white p-1.5"><img src="/brand/logo.png" alt="" className="h-full w-auto" /></span>
        <span className="font-semibold text-white">{author}</span>
      </figcaption>
    </figure>
  )
}

export default function AboutPage() {
  const { settings } = useSettings()
  const c = settings.company
  const { data: page, loading } = useQuery('page:chi-siamo', () => getPage('chi-siamo'))
  const { data: portfolio } = useQuery('portfolio:home', listPortfolio, { staleMs: 5 * 60_000 })
  const { data: featured } = useQuery('catalog:featured', listFeatured)
  const { data: products } = useQuery('catalog:products:all', () => listProducts({}))
  const { data: categories } = useQuery('catalog:categories', listCategories, { staleMs: 5 * 60_000 })

  useMeta({
    title: page?.seo_title || page?.title || 'Chi siamo',
    description: page?.seo_description || page?.excerpt || stripMarkdown(page?.content),
    type: 'article',
  })

  const { intro, sections } = useMemo(() => splitSections(page?.content ?? ''), [page?.content])

  // foto reali: prima i progetti del portfolio, poi le foto dei prodotti in evidenza
  const photos = useMemo(() => {
    const out: Photo[] = []
    for (const p of portfolio ?? []) {
      const src = publicUrl(p.image_path)
      if (src) out.push({ src, alt: p.image_alt || `${p.team_name}${p.title ? ` – ${p.title}` : ''}`, caption: p.team_name })
    }
    for (const p of featured ?? []) {
      const src = publicUrl(primaryImage(p)?.storage_path)
      if (src && !out.some((o) => o.src === src)) out.push({ src, alt: p.name, caption: p.name })
    }
    return out.slice(0, 5)
  }, [portfolio, featured])

  const stats = [
    { icon: <LayoutGrid className="h-5 w-5" />, value: products?.length ?? 0, label: products?.length === 1 ? 'articolo in catalogo' : 'articoli in catalogo', to: '/catalogo' },
    { icon: <Box className="h-5 w-5" />, value: (categories ?? []).filter((x) => !x.parent_id).length, label: 'categorie di prodotto', to: '/catalogo' },
    { icon: <Images className="h-5 w-5" />, value: portfolio?.length ?? 0, label: portfolio?.length === 1 ? 'progetto in portfolio' : 'progetti in portfolio', to: '/#portfolio' },
  ].filter((s) => s.value > 0)

  if (loading && !page) {
    return (
      <>
        <div className="-mt-16 h-[26rem] bg-ink-950" />
        <div className="container grid gap-4 py-14 md:grid-cols-3"><Skeleton className="h-56 md:col-span-2" /><Skeleton className="h-56" /></div>
      </>
    )
  }
  if (!page) return <NotFoundPage />

  return (
    <>
      <PageHero title={page.title} aside={photos.length ? <PhotoCollage photos={photos} /> : undefined}>
        {page.excerpt && <HeroQuote text={page.excerpt} author={c.name} />}
      </PageHero>

      <section className="container pt-14 sm:pt-20" aria-label="La nostra realtà">
        <div className="grid gap-3 sm:gap-4 md:grid-cols-6">
          {/* Introduzione */}
          {intro && (
            <Reveal className="relative overflow-hidden rounded-[1.75rem] bg-white p-6 ring-1 ring-ink-200 sm:rounded-[2rem] sm:p-10 md:col-span-4">
              <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-gold-100 blur-3xl" />
              <div className="relative">
                <Markdown source={intro} className="text-xl leading-9 text-ink-800 sm:text-2xl sm:leading-[2.6rem] [&_p]:text-inherit" />
                <Link to="/catalogo" className="group mt-8 inline-flex items-center gap-3 text-sm font-semibold text-ink-900">
                  Scopri il catalogo
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-950 text-gold-400 transition-transform group-hover:translate-x-1"><ArrowRight className="h-4 w-4" /></span>
                </Link>
              </div>
            </Reveal>
          )}

          {/* Numeri reali dal catalogo */}
          {stats.length > 0 && (
            <Reveal delay={100} className={cn('grid gap-3 sm:gap-4', intro ? 'md:col-span-2' : 'md:col-span-6 md:grid-cols-3')}>
              {stats.map((s) => (
                <Link key={s.label} to={s.to} className="group relative flex items-center gap-4 overflow-hidden rounded-[1.5rem] bg-ink-950 p-5 text-white transition hover:bg-ink-900 sm:p-6">
                  <span aria-hidden className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gold-500/20 blur-2xl transition-transform duration-500 group-hover:scale-150" />
                  <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-gold-400">{s.icon}</span>
                  <span className="relative">
                    <span className="block font-display text-4xl font-black leading-none" style={{ fontStretch: '115%' }}><CountUp value={s.value} /></span>
                    <span className="mt-1 block text-sm text-ink-300">{s.label}</span>
                  </span>
                </Link>
              ))}
            </Reveal>
          )}

          {/* Sezioni del contenuto (## Titolo) */}
          {sections.map((s, i) => (
            <Reveal
              key={s.title}
              delay={(i % 3) * 90}
              className={cn(
                'rounded-[1.75rem] p-6 sm:rounded-[2rem] sm:p-8',
                i % 2 === 0 ? 'bg-gold-100/70 ring-1 ring-gold-200' : 'bg-white ring-1 ring-ink-200',
                sections.length === 1 ? 'md:col-span-6' : sections.length === 2 ? 'md:col-span-3' : 'md:col-span-2',
              )}
            >
              <h2 className="display-lg text-2xl">{s.title}</h2>
              {s.body && <Markdown source={s.body} className="mt-4 [&_p]:whitespace-pre-line" />}
            </Reveal>
          ))}
        </div>
      </section>

      {/* Call to action finali (stesso stile della home) */}
      <section className="container grid gap-3 pt-14 sm:gap-4 sm:pt-20 md:grid-cols-2">
        <Reveal>
          <Link to="/catalogo" className="group relative flex h-full min-h-[13rem] flex-col justify-between gap-6 overflow-hidden rounded-[1.75rem] bg-gold-500 p-6 text-ink-950 sm:min-h-[16rem] sm:rounded-[2rem] sm:p-10">
            <div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gold-300/70 blur-3xl transition-transform duration-700 group-hover:scale-125" />
            <Grain opacity={0.18} />
            <h2 className="display-lg relative text-[clamp(1.5rem,6.6vw,2.25rem)] text-ink-950"><AccentTitle text="Configura la tua divisa" /></h2>
            <span className="relative inline-flex items-center gap-3 font-semibold">
              Vai al catalogo
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-950 text-gold-400 transition-transform group-hover:translate-x-1"><ArrowRight className="h-4 w-4" /></span>
            </span>
          </Link>
        </Reveal>
        <Reveal delay={120}>
          <div className="flex h-full min-h-[13rem] flex-col justify-between gap-6 rounded-[1.75rem] bg-white p-6 ring-1 ring-ink-200 sm:min-h-[16rem] sm:rounded-[2rem] sm:p-10">
            <h2 className="display-lg text-[clamp(1.5rem,6.6vw,2.25rem)]"><AccentTitle text="Parliamo del tuo progetto" accentClassName="text-gold-600" /></h2>
            <div className="flex flex-wrap gap-3">
              <ButtonLink to="/contatti" className="rounded-full">Scrivici</ButtonLink>
              <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className="inline-flex h-11 items-center gap-2 rounded-full px-5 font-mono text-sm font-medium ring-1 ring-ink-200 transition hover:ring-ink-900">
                <Phone className="h-4 w-4" /> {c.phone}
              </a>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  )
}
