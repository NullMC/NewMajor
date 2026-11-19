import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import type { Page } from '@/types/db'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/format'
import { useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { Badge, EmptyState, PageHeader, Skeleton } from '@/components/ui/Display'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/Table'

export default function PagesPage() {
  useMeta({ title: 'Pagine', noindex: true })
  const navigate = useNavigate()
  const { data, loading } = useQuery('admin:pages', async () => {
    const { data: rows, error } = await supabase.from('pages').select('*').is('deleted_at', null).order('kind').order('sort_order')
    if (error) throw error
    return rows as Page[]
  })
  return (
    <div className="space-y-6">
      <PageHeader
        title="Pagine"
        description="“Chi siamo”, pagine legali (termini, privacy, cookie, rimborsi) e altre pagine. Ogni pagina è raggiungibile all’indirizzo /slug."
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/admin/pagine/nuova')}>Nuova pagina</Button>}
      />
      {loading && !data ? <Skeleton className="h-64" /> : (
        <DataTable
          caption="Pagine"
          rows={data ?? []}
          rowKey={(p) => p.id}
          onRowClick={(p) => navigate(`/admin/pagine/${p.id}`)}
          empty={<EmptyState title="Nessuna pagina" />}
          columns={[
            { key: 'title', header: 'Titolo', cell: (p) => <div><p className="font-medium">{p.title}</p><p className="text-xs text-ink-500">/{p.slug}</p></div> },
            { key: 'kind', header: 'Tipo', cell: (p) => (p.kind === 'legal' ? <Badge tone="dark">Legale</Badge> : <Badge>Pagina</Badge>) },
            { key: 'status', header: 'Stato', cell: (p) => (p.is_published ? <Badge tone="success">Pubblicata</Badge> : <Badge tone="warning">Bozza</Badge>) },
            { key: 'updated', header: 'Aggiornata', hideBelow: 'sm', cell: (p) => formatDate(p.updated_at) },
          ]}
        />
      )}
    </div>
  )
}
