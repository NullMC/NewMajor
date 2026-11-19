import { useState } from 'react'
import type { AuditLog } from '@/types/db'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/format'
import { useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { Badge, EmptyState, PageHeader, Skeleton } from '@/components/ui/Display'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Form'
import { DataTable } from '@/components/ui/Table'

const ENTITY: Record<string, string> = {
  products: 'Prodotti', categories: 'Categorie', garment_types: 'Tipologie', orders: 'Ordini', order_statuses: 'Stati ordine',
  settings: 'Impostazioni', pages: 'Pagine', site_content: 'Contenuti', faqs: 'FAQ', profiles: 'Utenti',
  featured_products: 'In evidenza', customization_assets: 'Libreria grafiche',
}
const ACTION: Record<string, { label: string; tone: 'success' | 'gold' | 'danger' }> = {
  insert: { label: 'Creazione', tone: 'success' }, update: { label: 'Modifica', tone: 'gold' }, delete: { label: 'Eliminazione', tone: 'danger' },
}

export default function AuditLogPage() {
  useMeta({ title: 'Registro attività', noindex: true })
  const [entity, setEntity] = useState('')
  const [limit, setLimit] = useState(100)
  const { data: actors } = useQuery('admin:actors', async () => {
    const { data, error } = await supabase.from('profiles').select('id,full_name,email').eq('role', 'admin')
    if (error) throw error
    return new Map((data ?? []).map((p) => [p.id, p.full_name || p.email]))
  })
  const { data, loading } = useQuery(`admin:audit:${entity}:${limit}`, async () => {
    let q = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(limit)
    if (entity) q = q.eq('entity', entity)
    const { data: rows, error } = await q
    if (error) throw error
    return rows as AuditLog[]
  })
  return (
    <div className="space-y-6">
      <PageHeader title="Registro attività" description="Storico delle modifiche a catalogo, ordini, contenuti e impostazioni." />
      <Select value={entity} onChange={(e) => setEntity(e.target.value)} className="max-w-xs" aria-label="Filtra per sezione">
        <option value="">Tutte le sezioni</option>
        {Object.entries(ENTITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </Select>
      {loading && !data ? <Skeleton className="h-64" /> : (
        <DataTable
          caption="Registro attività"
          rows={data ?? []}
          rowKey={(r) => String(r.id)}
          empty={<EmptyState title="Nessuna attività registrata" />}
          columns={[
            { key: 'date', header: 'Data', cell: (r) => <span className="whitespace-nowrap text-xs">{formatDateTime(r.created_at)}</span> },
            { key: 'action', header: 'Azione', cell: (r) => <Badge tone={ACTION[r.action]?.tone ?? 'gold'}>{ACTION[r.action]?.label ?? r.action}</Badge> },
            { key: 'entity', header: 'Sezione', cell: (r) => ENTITY[r.entity] ?? r.entity },
            {
              key: 'details', header: 'Dettagli', hideBelow: 'md', cell: (r) => {
                const d = r.details as { changed?: string[]; label?: string }
                return <span className="text-xs text-ink-600">{d.label ?? (d.changed ? `Campi: ${d.changed.join(', ')}` : r.entity_id)}</span>
              },
            },
            { key: 'actor', header: 'Utente', hideBelow: 'sm', cell: (r) => (r.actor_id ? actors?.get(r.actor_id) ?? 'Utente' : 'Sistema') },
          ]}
        />
      )}
      {data && data.length >= limit && <div className="flex justify-center"><Button variant="secondary" onClick={() => setLimit((l) => l + 100)}>Carica altri</Button></div>}
    </div>
  )
}
