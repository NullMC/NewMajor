import type { Category } from '@/types/db'
import { useQuery } from '@/hooks/useQuery'
import { supabase } from '@/lib/supabase'
import { Badge } from '@/components/ui/Display'
import { useMeta } from '@/hooks/useMeta'
import { ResourceManager } from '../components/ResourceManager'
import { ThumbCell } from '../components/fields'

export default function CategoriesPage() {
  useMeta({ title: 'Categorie', noindex: true })
  const { data: all } = useQuery('admin:categories', async () => {
    const { data, error } = await supabase.from('categories').select('*').is('deleted_at', null).order('sort_order')
    if (error) throw error
    return data as Category[]
  })
  const parents = (all ?? []).filter((c) => !c.parent_id)
  const nameOf = (id: string | null) => (all ?? []).find((c) => c.id === id)?.name

  return (
    <ResourceManager<Category & Record<string, unknown>>
      config={{
        table: 'categories',
        title: 'Categorie',
        description: 'Categorie e sottocategorie del catalogo.',
        singular: 'Categoria',
        sortable: true,
        softDelete: true,
        imageKeys: ['image_path'],
        searchKeys: ['name', 'slug'],
        invalidates: ['catalog:'],
        defaults: { is_active: true, parent_id: null },
        fields: [
          { key: 'name', label: 'Nome', type: 'text', required: true },
          { key: 'slug', label: 'Slug (URL)', type: 'slug', from: 'name', required: true, hint: 'Usato in /catalogo/slug' },
          { key: 'parent_id', label: 'Categoria padre', type: 'select', options: parents.map((p) => ({ value: p.id, label: p.name })), hint: 'Lascia vuoto per una categoria principale' },
          { key: 'is_active', label: 'Visibile', type: 'boolean' },
          { key: 'description', label: 'Descrizione', type: 'textarea' },
          { key: 'image_path', label: 'Immagine', type: 'image', folder: 'categories' },
        ],
        columns: [
          { key: 'img', header: '', className: 'w-14', cell: (r) => <ThumbCell path={r.image_path} /> },
          { key: 'name', header: 'Nome', cell: (r) => <span className="font-medium">{r.name}</span> },
          { key: 'parent', header: 'Padre', hideBelow: 'sm', cell: (r) => nameOf(r.parent_id) ?? '—' },
          { key: 'slug', header: 'Slug', hideBelow: 'md', cell: (r) => <code className="text-xs">{r.slug}</code> },
          { key: 'active', header: 'Stato', cell: (r) => (r.is_active ? <Badge tone="success">Visibile</Badge> : <Badge>Nascosta</Badge>) },
        ],
      }}
    />
  )
}
