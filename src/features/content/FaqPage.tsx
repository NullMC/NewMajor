// Domande frequenti: intestazione comune con ricerca; a sinistra (fissa su desktop) le
// categorie come schede e il riquadro contatti, a destra la fisarmonica numerata con apertura
// animata. Domande e risposte arrivano dal backoffice (FAQ).

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, MessageSquareText, Phone, Plus, Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { EmptyState, Skeleton } from '@/components/ui/Display'
import { Markdown } from '@/components/ui/Markdown'
import { ButtonLink } from '@/components/ui/Button'
import { Reveal } from '@/components/fx/Reveal'
import { useSettings } from '@/features/settings/SettingsProvider'
import { listFaqs } from './api'
import { PageHero } from './PageHero'

const ALL = '__all'

export default function FaqPage() {
  const { settings } = useSettings()
  const { data: faqs, loading } = useQuery('faqs', listFaqs)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState(ALL)
  const [open, setOpen] = useState<string | null>(null)

  const categories = useMemo(() => {
    const map = new Map<string, number>()
    for (const f of faqs ?? []) map.set(f.category || 'Generale', (map.get(f.category || 'Generale') ?? 0) + 1)
    return [...map.entries()]
  }, [faqs])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (faqs ?? []).filter((f) =>
      (cat === ALL || (f.category || 'Generale') === cat) &&
      (!term || f.question.toLowerCase().includes(term) || f.answer.toLowerCase().includes(term)))
  }, [faqs, q, cat])

  useMeta({
    title: 'Domande frequenti',
    description: 'Risposte alle domande più comuni su personalizzazione, ordini, pagamenti e spedizioni New Major.',
    jsonLd: faqs?.length
      ? {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
        }
      : null,
  })

  const chip = (active: boolean) =>
    cn('inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors lg:w-full lg:justify-between lg:rounded-xl',
      active ? 'bg-ink-950 text-white' : 'bg-white text-ink-700 ring-1 ring-ink-200 hover:ring-ink-400')

  return (
    <>
      <PageHero
        kicker="Domande frequenti"
        title="Hai una domanda?"
        lead="Le risposte su personalizzazione, ordini e pagamenti. Se non trovi quello che cerchi, scrivici."
      >
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca una domanda…"
            aria-label="Cerca nelle FAQ"
            className="h-14 w-full rounded-full border-0 bg-white/[.07] pr-5 text-base text-white ring-1 ring-white/15 backdrop-blur placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-gold-500"
            style={{ paddingLeft: '3.25rem' }}
          />
        </div>
      </PageHero>

      <div className="container grid gap-8 pt-10 sm:pt-14 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-12">
        {/* Colonna sinistra: categorie e contatti */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          {categories.length > 1 && (
            <nav aria-label="Categorie delle domande" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
              <button type="button" className={chip(cat === ALL)} aria-pressed={cat === ALL} onClick={() => setCat(ALL)}>
                Tutte <span className={cn('font-mono text-xs', cat === ALL ? 'text-gold-400' : 'text-ink-400')}>{faqs?.length ?? 0}</span>
              </button>
              {categories.map(([name, n]) => (
                <button key={name} type="button" className={chip(cat === name)} aria-pressed={cat === name} onClick={() => setCat(name)}>
                  {name} <span className={cn('font-mono text-xs', cat === name ? 'text-gold-400' : 'text-ink-400')}>{n}</span>
                </button>
              ))}
            </nav>
          )}
          <div className="relative mt-6 hidden overflow-hidden rounded-[1.5rem] bg-ink-950 p-6 text-white lg:block">
            <span aria-hidden className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gold-500/25 blur-3xl" />
            <MessageSquareText className="relative h-6 w-6 text-gold-400" aria-hidden />
            <p className="relative mt-4 text-lg font-semibold leading-snug">Non trovi la risposta?</p>
            <p className="relative mt-1 text-sm text-ink-300">Ti rispondiamo noi, per telefono o dal modulo contatti.</p>
            <div className="relative mt-5 space-y-2">
              <Link to="/contatti" className="group flex items-center justify-between rounded-xl bg-gold-500 px-4 py-3 text-sm font-semibold text-ink-950 hover:bg-gold-400">
                Scrivici <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a href={`tel:${settings.company.phone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-2 rounded-xl px-4 py-3 font-mono text-sm ring-1 ring-white/15 hover:ring-white/40">
                <Phone className="h-4 w-4 text-gold-400" /> {settings.company.phone}
              </a>
            </div>
          </div>
        </aside>

        {/* Fisarmonica */}
        <div>
          {loading && !faqs ? (
            <div className="space-y-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
          ) : filtered.length ? (
            <ol className="space-y-3">
              {filtered.map((f, i) => {
                const isOpen = open === f.id
                return (
                  <Reveal as="li" key={f.id} delay={Math.min(i, 5) * 60}>
                    <div className={cn('group rounded-2xl bg-white ring-1 transition-shadow', isOpen ? 'shadow-[0_24px_50px_-30px_rgba(8,8,10,.45)] ring-ink-900' : 'ring-ink-200 hover:ring-ink-400')}>
                      <h2 className="font-sans" style={{ fontStretch: '100%' }}>
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-controls={`faq-${f.id}`}
                          onClick={() => setOpen(isOpen ? null : f.id)}
                          className="flex w-full items-start gap-4 px-5 py-5 text-left sm:gap-6 sm:px-7"
                        >
                          <span className={cn('pt-0.5 font-mono text-sm font-medium tabular-nums transition-colors', isOpen ? 'text-gold-600' : 'text-ink-400')}>{String(i + 1).padStart(2, '0')}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-base font-semibold leading-snug text-ink-950 sm:text-lg">{f.question}</span>
                            {cat === ALL && categories.length > 1 && <span className="mt-1 block font-mono text-2xs uppercase tracking-[0.14em] text-ink-400">{f.category || 'Generale'}</span>}
                          </span>
                          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-300', isOpen ? 'rotate-45 bg-gold-500 text-ink-950' : 'bg-ink-100 text-ink-600 group-hover:bg-ink-200')}>
                            <Plus className="h-4 w-4" aria-hidden />
                          </span>
                        </button>
                      </h2>
                      {/* apertura animata: righe della griglia da 0fr a 1fr */}
                      <div id={`faq-${f.id}`} inert={!isOpen} className={cn('grid transition-[grid-template-rows] duration-300 ease-out', isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                        <div className="overflow-hidden">
                          <div className="px-5 pb-6 sm:pl-[4.25rem] sm:pr-16">
                            <Markdown source={f.answer} className="text-ink-600" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </Reveal>
                )
              })}
            </ol>
          ) : (
            <EmptyState
              title={q ? 'Nessun risultato' : 'Nessuna domanda presente'}
              description="Non trovi la risposta? Contattaci."
              action={<ButtonLink to="/contatti" variant="secondary">Contattaci</ButtonLink>}
            />
          )}

          {/* Contatti su mobile e tablet */}
          <div className="mt-8 flex flex-col gap-4 rounded-[1.5rem] bg-ink-950 p-6 text-white sm:flex-row sm:items-center sm:justify-between lg:hidden">
            <div>
              <p className="text-lg font-semibold">Non trovi la risposta?</p>
              <p className="mt-1 text-sm text-ink-300">Ti rispondiamo noi, per telefono o dal modulo contatti.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/contatti" className="inline-flex h-11 items-center gap-2 rounded-full bg-gold-500 px-5 text-sm font-semibold text-ink-950">Scrivici <ArrowRight className="h-4 w-4" /></Link>
              <a href={`tel:${settings.company.phone.replace(/[^\d+]/g, '')}`} className="inline-flex h-11 items-center gap-2 rounded-full px-5 font-mono text-sm ring-1 ring-white/20"><Phone className="h-4 w-4 text-gold-400" /> {settings.company.phone}</a>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
