import { Link } from 'react-router-dom'
import { ArrowRight, Check, Phone } from 'lucide-react'
import { useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { ButtonLink } from '@/components/ui/Button'
import { useSettings } from '@/features/settings/SettingsProvider'
import { listCategories, listFeatured } from '@/features/catalog/api'
import { ProductCard, ProductCardSkeleton } from '@/features/catalog/ProductCard'
import { getSiteContents, type HeroContent, type HomeSections } from './api'
import { Hero } from './hero/Hero'
import { Reveal, AccentTitle } from '@/components/fx/Reveal'
import { ShaderBackdrop, Grain } from '@/components/fx/ShaderBackdrop'

export default function HomePage() {
  const { settings } = useSettings()
  const { data: content } = useQuery('content:home', () => getSiteContents(['home.hero', 'home.sections', 'home.featured']), { staleMs: 5 * 60_000 })
  const { data: featured, loading: featuredLoading } = useQuery('catalog:featured', listFeatured)
  const { data: categories } = useQuery('catalog:categories', listCategories, { staleMs: 5 * 60_000 })

  const hero = (content?.['home.hero'] ?? null) as HeroContent | null
  const sections = (content?.['home.sections'] ?? {}) as HomeSections
  const featuredMeta = (content?.['home.featured'] ?? {}) as { title?: string; subtitle?: string }
  const topCategories = (categories ?? []).filter((c) => !c.parent_id).slice(0, 6)

  useMeta({})

  return (
    <>
      <Hero hero={hero} />

      {/* Categorie */}
      {topCategories.length > 0 && (
        <section className="container pt-10 sm:pt-14" aria-label="Categorie">
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            {topCategories.map((c) => (
              <Link key={c.id} to={`/catalogo/${c.slug}`} className="group inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold ring-1 ring-ink-200 transition hover:bg-ink-900 hover:text-white hover:ring-ink-900">
                {c.name} <ArrowRight className="h-4 w-4 text-ink-400 transition group-hover:translate-x-0.5 group-hover:text-gold-400" aria-hidden />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Prodotti in evidenza (selezionati dal backoffice) */}
      {(featuredLoading || !!featured?.length) && (
        <section className="container pt-16 sm:pt-24" aria-labelledby="featured">
          <Reveal className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="featured" className="display-lg text-[clamp(1.5rem,6.6vw,3rem)]"><AccentTitle text={featuredMeta.title || 'In evidenza'} accentClassName="text-gold-600" /></h2>
              {featuredMeta.subtitle && <p className="mt-3 max-w-xl text-ink-500">{featuredMeta.subtitle}</p>}
            </div>
            <Link to="/catalogo" className="group inline-flex items-center gap-2 text-sm font-semibold hover:text-gold-700">
              Tutto il catalogo <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Reveal>
          <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {featuredLoading && !featured
              ? Array.from({ length: 4 }, (_, i) => <ProductCardSkeleton key={i} />)
              : featured!.slice(0, 8).map((p, i) => (
                <Reveal key={p.id} delay={(i % 4) * 90}><ProductCard product={p} eager={i < 2} /></Reveal>
              ))}
          </div>
        </section>
      )}

      {/* Personalizzazione */}
      {sections.personalization && (
        <section className="container pt-20 sm:pt-32">
          <Reveal className="grid gap-10 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] lg:gap-16">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <h2 className="display-lg text-[clamp(1.5rem,6.6vw,3rem)]"><AccentTitle text={sections.personalization.title} accentClassName="text-gold-600" /></h2>
              <p className="mt-5 max-w-md text-lg leading-8 text-ink-600">{sections.personalization.text}</p>
              <ButtonLink to="/catalogo" size="lg" className="mt-9 rounded-full" icon={<ArrowRight className="h-4 w-4" />}>Inizia a configurare</ButtonLink>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {sections.personalization.points.map((p) => (
                <li key={p} className="group flex min-h-[9.5rem] flex-col justify-between gap-6 rounded-[1.5rem] bg-white p-6 ring-1 ring-ink-200 transition hover:-translate-y-0.5 hover:shadow-card">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-900 text-gold-400 transition group-hover:bg-gold-500 group-hover:text-ink-950"><Check className="h-4 w-4" aria-hidden /></span>
                  <span className="text-base font-semibold leading-6 text-ink-900">{p}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </section>
      )}

      {/* Processo */}
      {sections.process && (
        <section className="container pt-20 sm:pt-32" aria-labelledby="process">
          <Reveal>
            <h2 id="process" className="display-lg text-[clamp(1.5rem,6.6vw,3rem)]"><AccentTitle text={sections.process.title} accentClassName="text-gold-600" /></h2>
          </Reveal>
          <ol className="mt-12 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {sections.process.steps.map((s, i) => (
              <Reveal as="li" key={s.title} delay={i * 110} className="relative border-t border-ink-900/15 pt-6">
                <span className="absolute -top-px left-0 h-px w-12 bg-gold-500" aria-hidden />
                <span className="font-serif text-6xl italic leading-none text-gold-600">{String(i + 1).padStart(2, '0')}</span>
                <p className="mt-6 text-lg font-semibold">{s.title}</p>
                <p className="mt-2 text-[15px] leading-7 text-ink-600">{s.text}</p>
              </Reveal>
            ))}
          </ol>
        </section>
      )}

      {/* Qualità grafiche */}
      {sections.quality && (
        <section className="container pt-20 sm:pt-32">
          <Reveal className="overflow-hidden rounded-[2rem] bg-ink-950 text-white">
            <div data-surface="dark" className="relative grid min-h-[22rem] items-end gap-8 p-8 sm:p-12 lg:grid-cols-[minmax(0,1fr)_auto] lg:p-16">
              <ShaderBackdrop palette="deep" anchor={[0.55, 0.25]} />
              <Grain />
              <div className="relative max-w-2xl">
                <h2 className="display-lg text-[clamp(1.5rem,6.6vw,3rem)] text-white"><AccentTitle text={sections.quality.title} accentClassName="text-gold-400" /></h2>
                <p className="mt-5 text-lg leading-8 text-ink-300">{sections.quality.text}</p>
              </div>
              <p className="relative whitespace-nowrap leading-[.8]">
                <span
                  className="bg-gradient-to-b from-white via-white/70 to-white/0 bg-clip-text font-display text-[7rem] font-extrabold text-transparent sm:text-[11rem]"
                  style={{ fontStretch: '120%' }}
                >
                  {settings.quality.min_dpi}
                </span>
                <span className="ml-2 align-top font-mono text-base font-medium tracking-widest text-gold-400 sm:text-lg">DPI</span>
              </p>
            </div>
          </Reveal>
        </section>
      )}

      {/* CTA finali */}
      <section className="container grid gap-4 pt-20 sm:pt-32 md:grid-cols-2">
        {sections.catalog_cta && (
          <Reveal>
            <Link to="/catalogo" className="group relative flex h-full min-h-[18rem] flex-col justify-between gap-8 overflow-hidden rounded-[2rem] bg-gold-500 p-8 text-ink-950 sm:p-10">
              <div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gold-300/70 blur-3xl transition-transform duration-700 group-hover:scale-125" />
              <Grain opacity={0.18} />
              <div className="relative">
                <h2 className="display-lg text-[clamp(1.5rem,6.6vw,2.25rem)] text-ink-950"><AccentTitle text={sections.catalog_cta.title} /></h2>
                <p className="mt-4 max-w-sm text-ink-800">{sections.catalog_cta.text}</p>
              </div>
              <span className="relative inline-flex items-center gap-3 font-semibold">
                Vai al catalogo
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-950 text-gold-400 transition-transform group-hover:translate-x-1"><ArrowRight className="h-4 w-4" /></span>
              </span>
            </Link>
          </Reveal>
        )}
        {sections.contact_cta && (
          <Reveal delay={120}>
            <div className="flex h-full min-h-[18rem] flex-col justify-between gap-8 rounded-[2rem] bg-white p-8 ring-1 ring-ink-200 sm:p-10">
              <div>
                <h2 className="display-lg text-[clamp(1.5rem,6.6vw,2.25rem)]"><AccentTitle text={sections.contact_cta.title} accentClassName="text-gold-600" /></h2>
                <p className="mt-4 max-w-sm text-ink-600">{sections.contact_cta.text}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <ButtonLink to="/contatti" className="rounded-full">Scrivici</ButtonLink>
                <a href={`tel:${settings.company.phone.replace(/[^\d+]/g, '')}`} className="inline-flex h-11 items-center gap-2 rounded-full px-5 font-mono text-sm font-medium ring-1 ring-ink-200 transition hover:ring-ink-900">
                  <Phone className="h-4 w-4" /> {settings.company.phone}
                </a>
              </div>
            </div>
          </Reveal>
        )}
      </section>
    </>
  )
}
