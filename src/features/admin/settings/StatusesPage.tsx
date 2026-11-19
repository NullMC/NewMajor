import type { OrderStatus } from '@/types/db'
import { useMeta } from '@/hooks/useMeta'
import { Badge, ProgressBar } from '@/components/ui/Display'
import { ResourceManager } from '../components/ResourceManager'

export default function StatusesPage() {
  useMeta({ title: 'Stati ordine', noindex: true })
  return (
    <ResourceManager<OrderStatus & Record<string, unknown>>
      config={{
        table: 'order_statuses',
        title: 'Stati ordine',
        description: 'Fasi dell’ordine mostrate al cliente. La percentuale definisce la barra di avanzamento; l’ordine definisce la sequenza.',
        singular: 'Stato',
        sortable: true,
        invalidates: ['order-statuses'],
        defaults: { is_active: true, progress: 0, is_initial: false, is_final: false, is_cancelled: false },
        fields: [
          { key: 'label', label: 'Etichetta', type: 'text', required: true },
          { key: 'code', label: 'Codice', type: 'text', required: true, hint: 'Minuscole e underscore, es. in_produzione' },
          { key: 'progress', label: 'Avanzamento (%)', type: 'number', min: 0, max: 100, step: 1 },
          { key: 'is_active', label: 'Attivo', type: 'boolean' },
          { key: 'is_initial', label: 'Stato iniziale dei nuovi ordini', type: 'boolean' },
          { key: 'is_final', label: 'Stato finale', type: 'boolean' },
          { key: 'is_cancelled', label: 'Rappresenta un annullamento', type: 'boolean' },
          { key: 'description', label: 'Descrizione per il cliente', type: 'textarea' },
        ],
        transform: (v) => ({ ...v, code: String(v.code ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '_') }),
        columns: [
          { key: 'label', header: 'Stato', cell: (r) => <span className="font-medium">{r.label}</span> },
          { key: 'progress', header: 'Avanzamento', hideBelow: 'sm', cell: (r) => <div className="flex w-40 items-center gap-2"><ProgressBar value={r.progress} label={r.label} /><span className="text-xs">{r.progress}%</span></div> },
          {
            key: 'flags', header: 'Tipo', cell: (r) => (
              <span className="flex flex-wrap gap-1">
                {r.is_initial && <Badge tone="gold">Iniziale</Badge>}
                {r.is_final && <Badge tone="success">Finale</Badge>}
                {r.is_cancelled && <Badge tone="danger">Annullato</Badge>}
                {!r.is_active && <Badge>Disattivo</Badge>}
              </span>
            ),
          },
        ],
      }}
    />
  )
}
