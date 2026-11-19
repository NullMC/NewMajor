import { Link } from 'react-router-dom'
import { ArrowRight, Check, Phone } from 'lucide-react'
import { useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { publicUrl } from '@/lib/storage'
import { ButtonLink } from '@/components/ui/Button'
import { useSettings } from '@/features/settings/SettingsProvider'
import { listCategories, listFeatured } from '@/features/catalog/api'
import { ProductCard, ProductCardSkeleton } from '@/features/catalog/ProductCard'
import { getSiteContents, type HeroContent, type HomeSections } from './api'
import { JerseyArt } from './JerseyArt'

const isInternal = (href?: string) => !!href && href.startsWith('/')

function Cta({ href, label, variant }: { href?: string; label?: string; variant: 'accent' | 'inverse' | 'primary' | 'secondary' }) {
  if (!href || !label) return null
  if (isInternal(href)) return <ButtonLink to={href} variant={variant} size="lg">{label}</ButtonLink>
  return <a href={href} className="inline-flex h-12 items-center rounded-xl border border-white/20 px-6 text-[15px] font-semibold text-white hover:border-white/50">{label}</a>
}

export default function HomePage() {
  const { settings } = useSettings()
  const { data: content } = useQuery('content:home', () => getSiteContents(['home.hero', 'home.sections', 'home.featured']), { staleMs: 5 * 60_000 })
  const { data: featured, loading: featuredLoading } = useQuery('catalog:featured', listFeatured)
  const { data: categories } = useQuery('catalog:categories', listCategories, { staleMs: 5 * 60_000 })

  const hero = (content?.['home.hero'] ?? null) as HeroContent | null
  const sections = (content?.['home.sections'] ?? {}) as HomeSections
  const featuredMeta = (content?.['home.featured'] ?? {}) as { title?: string; subtitle?: string }
  const heroImage = publicUrl(hero?.image_path)
  const topCategories = (categories ?? []).filter((c) => !c.parent_id).slice(0, 6)

  useMeta({})

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-ink-900 text-white">
        <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_70%_40%,black,transparent_70%)]" aria-hidden />
        <div className="absolute -right-40 top-1/3 h-[32rem] w-[32rem] rounded-full bg-gold-500/10 blur-3xl" aria-hidden />
        <div className="container relative grid items-center gap-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:py-28">
          <div className="animate-slide-up">
            <h1 lang="it" className="display-xl text-[clamp(1.75rem,8vw,3.5rem)] text-white [hyphens:auto] [overflow-wrap:break-word] lg:text-[clamp(2.4rem,3.9vw,4.25rem)]" style={{ fontStretch: '108%' }}>
              {hero?.title ?? 'Divise e kit da gara personalizzati'}
            </h1>
            {hero?.subtitle && <p className="mt-6 max-w-xl text-lg leading-8 text-ink-300">{hero.subtitle}</p>}
            <div className="mt-9 flex flex-wrap gap-3">
              <Cta href={hero?.cta_primary?.href ?? '/catalogo'} label={hero?.cta_primary?.label ?? 'Personalizza ora'} variant="accent" />
              <Cta href={hero?.cta_secondary?.href} label={hero?.cta_secondary?.label} variant="inverse" />
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-xl">
            {heroImage ? (
              <img src={heroImage} alt="" className="aspect-[4/3] w-full rounded-2xl object-cover" fetchPriority="high" />
            ) : (
              <JerseyArt className="w-full drop-shadow-[0_30px_40px_rgba(0,0,0,0.45)]" />
            )}
          </div>
        </div>
      </section>

      {/* Categorie */}
      {topCategories.length > 0 && (
        <section className="container pt-16" aria-label="Categorie">
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            {topCategories.map((c) => (
              <Link key={c.id} to={`/catalogo/${c.slug}`} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-ink-200 bg-white px-5 text-sm font-semibold hover:border-ink-900">
                {c.name} <ArrowRight className="h-4 w-4 text-ink-400" aria-hidden />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Prodotti in evidenza (selezionati dal backoffice) */}
      {(featuredLoading || !!featured?.length) && (
        <section className="container pt-16 sm:pt-20" aria-labelledby="featured">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="featured" className="display-lg text-3xl sm:text-4xl">{featuredMeta.title || 'In evidenza'}</h2>
              {featuredMeta.subtitle && <p className="mt-2 text-ink-500">{featuredMeta.subtitle}</p>}
            </div>
            <Link to="/catalogo" className="inline-flex items-center gap-1.5 text-sm font-semibold hover:text-gold-700">
              Tutto il catalogo <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {featuredLoading && !featured
              ? Array.from({ length: 4 }, (_, i) => <ProductCardSkeleton key={i} />)
              : featured!.slice(0, 8).map((p, i) => <ProductCard key={p.id} product={p} eager={i < 2} />)}
          </div>
        </section>
      )}

      {/* Personalizzazione */}
      {sections.personalization && (
        <section className="container pt-20 sm:pt-28">
          <div className="grid gap-10 overflow-hidden rounded-[1.75rem] bg-white p-6 ring-1 ring-ink-200 sm:p-10 lg:grid-cols-2 lg:p-14">
            <div>
              <h2 className="display-lg text-3xl sm:text-4xl">{sections.personalization.title}</h2>
              <p className="mt-4 max-w-md text-ink-600">{sections.personalization.text}</p>
              <ButtonLink to="/catalogo" className="mt-8" icon={<ArrowRight className="h-4 w-4" />}>Inizia a configurare</ButtonLink>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {sections.personalization.points.map((p) => (
                <li key={p} className="flex items-start gap-3 rounded-2xl bg-ink-50 p-5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-900 text-gold-400"><Check className="h-4 w-4" aria-hidden /></span>
                  <span className="text-[15px] font-medium leading-6 text-ink-900">{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Processo */}
      {sections.process && (
        <section className="container pt-20 sm:pt-28" aria-labelledby="process">
          <h2 id="process" className="display-lg text-3xl sm:text-4xl">{sections.process.title}</h2>
          <ol className="mt-10 grid gap-px overflow-hidden rounded-2xl bg-ink-200 sm:grid-cols-2 lg:grid-cols-4">
            {sections.process.steps.map((s, i) => (
              <li key={s.title} className="bg-ink-50 p-6 sm:p-8">
                <span className="font-display text-5xl font-extrabold text-gold-500" style={{ fontStretch: '115%' }}>{String(i + 1).padStart(2, '0')}</span>
                <p className="mt-5 text-lg font-semibold">{s.title}</p>
                <p className="mt-2 text-sm leading-6 text-ink-600">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Qualità grafiche */}
      {sections.quality && (
        <section className="container pt-20 sm:pt-28">
          <div className="relative overflow-hidden rounded-[1.75rem] bg-ink-900 p-8 text-white sm:p-12 lg:p-16">
            <div className="absolute -right-10 -top-10 font-display text-[11rem] font-extrabold leading-none text-white/[0.04] sm:text-[16rem]" aria-hidden style={{ fontStretch: '120%' }}>
              {settings.quality.min_dpi}
            </div>
            <div className="relative max-w-2xl">
              <p className="font-display text-sm font-bold uppercase tracking-[0.2em] text-gold-400">{settings.quality.min_dpi} dpi</p>
              <h2 className="display-lg mt-3 text-3xl text-white sm:text-4xl">{sections.quality.title}</h2>
              <p className="mt-4 text-ink-300">{sections.quality.text}</p>
            </div>
          </div>
        </section>
      )}

      {/* CTA finali */}
      <section className="container grid gap-4 pt-20 sm:pt-28 md:grid-cols-2">
        {sections.catalog_cta && (
          <Link to="/catalogo" className="group flex flex-col justify-between gap-8 rounded-[1.75rem] bg-gold-500 p-8 text-ink-950 sm:p-10">
            <div>
              <h2 className="display-lg text-3xl text-ink-950">{sections.catalog_cta.title}</h2>
              <p className="mt-3 max-w-sm text-ink-800">{sections.catalog_cta.text}</p>
            </div>
            <span className="inline-flex items-center gap-2 font-semibold">Vai al catalogo <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
          </Link>
        )}
        {sections.contact_cta && (
          <div className="flex flex-col justify-between gap-8 rounded-[1.75rem] bg-white p-8 ring-1 ring-ink-200 sm:p-10">
            <div>
              <h2 className="display-lg text-3xl">{sections.contact_cta.title}</h2>
              <p className="mt-3 max-w-sm text-ink-600">{sections.contact_cta.text}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink to="/contatti">Scrivici</ButtonLink>
              <a href={`tel:${settings.company.phone.replace(/[^\d+]/g, '')}`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-ink-200 px-5 text-sm font-semibold hover:border-ink-400">
                <Phone className="h-4 w-4" /> {settings.company.phone}
              </a>
            </div>
          </div>
        )}
      </section>
    </>
  )
}
