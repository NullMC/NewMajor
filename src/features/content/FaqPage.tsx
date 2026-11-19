import { useMemo, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { Input } from '@/components/ui/Form'
import { EmptyState, Markdown, Skeleton } from '@/components/ui/Display'
import { ButtonLink } from '@/components/ui/Button'
import { listFaqs } from './api'

export default function FaqPage() {
  const { data: faqs, loading } = useQuery('faqs', listFaqs)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (faqs ?? []).filter((f) => !term || f.question.toLowerCase().includes(term) || f.answer.toLowerCase().includes(term))
  }, [faqs, q])

  const groups = useMemo(() => {
    const map = new Map<string, typeof filtered>()
    for (const f of filtered) {
      const k = f.category || 'Generale'
      map.set(k, [...(map.get(k) ?? []), f])
    }
    return [...map.entries()]
  }, [filtered])

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

  return (
    <div className="container max-w-3xl py-12 sm:py-16">
      <h1 className="display-lg text-4xl sm:text-5xl">Domande frequenti</h1>
      <div className="relative mt-8">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca una domanda…" aria-label="Cerca nelle FAQ" className="pl-10" />
      </div>

      {loading && !faqs ? (
        <div className="mt-8 space-y-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : groups.length ? (
        <div className="mt-10 space-y-10">
          {groups.map(([cat, items]) => (
            <section key={cat} aria-label={cat}>
              {groups.length > 1 && <h2 className="label-caps mb-3">{cat}</h2>}
              <ul className="divide-y divide-ink-200 rounded-2xl border border-ink-200 bg-white">
                {items.map((f) => {
                  const isOpen = open === f.id
                  return (
                    <li key={f.id}>
                      <h3 className="font-sans" style={{ fontStretch: '100%' }}>
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-controls={`faq-${f.id}`}
                          onClick={() => setOpen(isOpen ? null : f.id)}
                          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-semibold"
                        >
                          {f.question}
                          <ChevronDown className={cn('h-5 w-5 shrink-0 text-ink-400 transition-transform', isOpen && 'rotate-180')} aria-hidden />
                        </button>
                      </h3>
                      <div id={`faq-${f.id}`} hidden={!isOpen} className="px-5 pb-5">
                        <Markdown source={f.answer} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState className="mt-10" title={q ? 'Nessun risultato' : 'Nessuna domanda presente'} description="Non trovi la risposta? Contattaci." action={<ButtonLink to="/contatti" variant="secondary">Contattaci</ButtonLink>} />
      )}
    </div>
  )
}
