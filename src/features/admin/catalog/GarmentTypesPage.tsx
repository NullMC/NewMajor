import type { GarmentType } from '@/types/db'
import { formatPrice } from '@/lib/format'
import { useMeta } from '@/hooks/useMeta'
import { Badge } from '@/components/ui/Display'
import { ResourceManager } from '../components/ResourceManager'

export default function GarmentTypesPage() {
  useMeta({ title: 'Tipologie capo', noindex: true })
  return (
    <ResourceManager<GarmentType & Record<string, unknown>>
      config={{
        table: 'garment_types',
        title: 'Tipologie capo',
        description: 'Tipologie/brand di maglia selezionabili nel configuratore (es. Smarcata, adidas, Mizuno). Associale ai prodotti dalla scheda prodotto.',
        singular: 'Tipologia',
        sortable: true,
        searchKeys: ['name', 'brand'],
        invalidates: ['catalog:', 'product:'],
        defaults: { is_active: true, price_delta: 0 },
        fields: [
          { key: 'name', label: 'Nome', type: 'text', required: true },
          { key: 'slug', label: 'Slug', type: 'slug', from: 'name', required: true },
          { key: 'brand', label: 'Brand', type: 'text' },
          { key: 'price_delta', label: 'Sovrapprezzo predefinito (€)', type: 'number', step: 0.01, hint: 'Può essere sovrascritto per singolo prodotto' },
          { key: 'is_active', label: 'Attiva', type: 'boolean' },
          { key: 'description', label: 'Descrizione', type: 'textarea' },
        ],
        columns: [
          { key: 'name', header: 'Nome', cell: (r) => <span className="font-medium">{r.name}</span> },
          { key: 'brand', header: 'Brand', hideBelow: 'sm', cell: (r) => r.brand ?? '—' },
          { key: 'price', header: 'Sovrapprezzo', cell: (r) => (Number(r.price_delta) ? formatPrice(r.price_delta) : '—') },
          { key: 'active', header: 'Stato', cell: (r) => (r.is_active ? <Badge tone="success">Attiva</Badge> : <Badge>Disattiva</Badge>) },
        ],
      }}
    />
  )
}
