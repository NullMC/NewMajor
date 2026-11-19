import type { Faq } from '@/types/db'
import { useMeta } from '@/hooks/useMeta'
import { Badge } from '@/components/ui/Display'
import { ResourceManager } from '../components/ResourceManager'

export default function FaqsPage() {
  useMeta({ title: 'FAQ', noindex: true })
  return (
    <ResourceManager<Faq & Record<string, unknown>>
      config={{
        table: 'faqs',
        title: 'FAQ',
        description: 'Domande frequenti: modificabili, ordinabili e attivabili.',
        singular: 'Domanda',
        sortable: true,
        searchKeys: ['question', 'answer', 'category'],
        invalidates: ['faqs'],
        defaults: { is_active: true },
        fields: [
          { key: 'question', label: 'Domanda', type: 'text', required: true, span: 2 },
          { key: 'category', label: 'Categoria', type: 'text', hint: 'Raggruppa le domande nella pagina FAQ' },
          { key: 'is_active', label: 'Pubblicata', type: 'boolean' },
          { key: 'answer', label: 'Risposta', type: 'markdown', required: true },
        ],
        columns: [
          { key: 'q', header: 'Domanda', cell: (r) => <span className="font-medium">{r.question}</span> },
          { key: 'cat', header: 'Categoria', hideBelow: 'sm', cell: (r) => r.category ?? '—' },
          { key: 'active', header: 'Stato', cell: (r) => (r.is_active ? <Badge tone="success">Pubblicata</Badge> : <Badge>Bozza</Badge>) },
        ],
      }}
    />
  )
}
