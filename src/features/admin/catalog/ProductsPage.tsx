import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, Copy, Plus, Search, Trash2, Undo2 } from 'lucide-react'
import type { Product } from '@/types/db'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { formatPrice, AVAILABILITY_LABEL } from '@/lib/format'
import { removePublic } from '@/lib/storage'
import { invalidate, useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { Badge, EmptyState, PageHeader, Skeleton } from '@/components/ui/Display'
import { Button } from '@/components/ui/Button'
import { Input, Select, Switch } from '@/components/ui/Form'
import { DataTable } from '@/components/ui/Table'
import { Tabs } from '@/components/ui/Tabs'
import { useUi } from '@/components/ui/Toast'
import { listCategories, primaryImage } from '@/features/catalog/api'
import { ThumbCell } from '../components/fields'
import { adminListProducts } from './api'

export default function ProductsPage() {
  useMeta({ title: 'Prodotti', noindex: true })
  const navigate = useNavigate()
  const { toast, confirm } = useUi()
  const [tab, setTab] = useState<'active' | 'archived'>('active')
  const { data, loading, reload, setData } = useQuery(`admin:products:${tab}`, () => adminListProducts(tab === 'archived'))
  const { data: categories } = useQuery('catalog:categories', listCategories)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [pub, setPub] = useState('')

  const rows = useMemo(() => (data ?? []).filter((p) =>
    (!q || p.name.toLowerCase().includes(q.toLowerCase()) || p.slug.includes(q.toLowerCase())) &&
    (!cat || p.category_id === cat) &&
    (!pub || String(p.is_published) === pub),
  ), [data, q, cat, pub])

  const after = () => { invalidate('catalog:'); invalidate('product:'); invalidate('admin:products') }

  const togglePublish = async (p: Product, v: boolean) => {
    setData((d) => (d ?? []).map((x) => (x.id === p.id ? { ...x, is_published: v } : x)))
    const { error } = await supabase.from('products').update({ is_published: v }).eq('id', p.id)
    if (error) { toast(errorMessage(error), 'error'); void reload() } else after()
  }

  const duplicate = async (p: Product) => {
    const { data: id, error } = await supabase.rpc('admin_duplicate_product', { p_id: p.id })
    if (error) return toast(errorMessage(error), 'error')
    after()
    toast('Prodotto duplicato (in bozza, senza immagini)')
    navigate(`/admin/prodotti/${id}`)
  }

  const archive = async (p: Product) => {
    if (!(await confirm({ title: 'Archiviare il prodotto?', message: 'Non sarà più visibile nel catalogo. Gli ordini esistenti restano invariati.', confirmLabel: 'Archivia' }))) return
    const { error } = await supabase.from('products').update({ deleted_at: new Date().toISOString(), is_published: false }).eq('id', p.id)
    if (error) return toast(errorMessage(error), 'error')
    await supabase.from('featured_products').delete().eq('product_id', p.id)
    after()
    setData((d) => (d ?? []).filter((x) => x.id !== p.id))
  }

  const restore = async (p: Product) => {
    const { error } = await supabase.from('products').update({ deleted_at: null }).eq('id', p.id)
    if (error) return toast(errorMessage(error), 'error')
    after()
    setData((d) => (d ?? []).filter((x) => x.id !== p.id))
    toast('Prodotto ripristinato (in bozza)')
  }

  const destroy = async (p: Product) => {
    if (!(await confirm({ title: 'Eliminare definitivamente?', message: 'Prodotto, configurazioni e immagini verranno eliminati. Gli ordini già effettuati conservano i propri dati.', confirmLabel: 'Elimina definitivamente', danger: true }))) return
    const { data: imgs } = await supabase.from('product_images').select('storage_path').eq('product_id', p.id)
    const { error } = await supabase.from('products').delete().eq('id', p.id)
    if (error) return toast(errorMessage(error), 'error')
    await removePublic((imgs ?? []).map((i) => i.storage_path)).catch(() => undefined)
    after()
    setData((d) => (d ?? []).filter((x) => x.id !== p.id))
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Prodotti" description="Catalogo, configurazioni e pubblicazione." actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/admin/prodotti/nuovo')}>Nuovo prodotto</Button>} />
      <Tabs ariaLabel="Stato prodotti" value={tab} onChange={setTab} items={[{ value: 'active', label: 'Catalogo' }, { value: 'archived', label: 'Archiviati' }]} />
      <div className="grid gap-2 sm:grid-cols-[1fr_12rem_10rem]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per nome o slug" className="pl-10" aria-label="Cerca prodotti" />
        </div>
        <Select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoria">
          <option value="">Tutte le categorie</option>
          {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={pub} onChange={(e) => setPub(e.target.value)} aria-label="Pubblicazione">
          <option value="">Tutti</option>
          <option value="true">Pubblicati</option>
          <option value="false">Bozze</option>
        </Select>
      </div>
      {loading && !data ? <Skeleton className="h-64" /> : (
        <DataTable
          caption="Prodotti"
          rows={rows}
          rowKey={(p) => p.id}
          onRowClick={(p) => navigate(`/admin/prodotti/${p.id}`)}
          empty={<EmptyState title={tab === 'archived' ? 'Nessun prodotto archiviato' : 'Nessun prodotto'} description={tab === 'active' ? 'Crea il primo prodotto del catalogo.' : undefined} />}
          columns={[
            { key: 'img', header: '', className: 'w-14', cell: (p) => <ThumbCell path={primaryImage(p)?.storage_path} /> },
            {
              key: 'name', header: 'Prodotto', cell: (p) => (
                <div className="min-w-0">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-ink-500">{p.categories?.name ?? 'Senza categoria'}{p.product_type === 'kit' ? ' · Kit' : ''}</p>
                </div>
              ),
            },
            { key: 'price', header: 'Prezzo base', hideBelow: 'sm', cell: (p) => formatPrice(p.base_price) },
            { key: 'avail', header: 'Disponibilità', hideBelow: 'md', cell: (p) => <Badge tone={p.availability === 'in_stock' ? 'success' : p.availability === 'out_of_stock' ? 'danger' : 'neutral'}>{AVAILABILITY_LABEL[p.availability]}</Badge> },
            {
              key: 'pub', header: 'Pubblicato', cell: (p) => tab === 'active'
                ? <span onClick={(e) => e.stopPropagation()}><Switch label={`Pubblica ${p.name}`} checked={p.is_published} onChange={(v) => void togglePublish(p, v)} /></span>
                : <Badge>Archiviato</Badge>,
            },
            {
              key: 'actions', header: <span className="sr-only">Azioni</span>, className: 'text-right', cell: (p) => (
                <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
                  {tab === 'active' ? (
                    <>
                      <button type="button" onClick={() => void duplicate(p)} className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label={`Duplica ${p.name}`}><Copy className="h-4 w-4" /></button>
                      <button type="button" onClick={() => void archive(p)} className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label={`Archivia ${p.name}`}><Archive className="h-4 w-4" /></button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => void restore(p)} className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label={`Ripristina ${p.name}`}><Undo2 className="h-4 w-4" /></button>
                      <button type="button" onClick={() => void destroy(p)} className="rounded-lg p-2 text-ink-500 hover:bg-danger-50 hover:text-danger-600" aria-label={`Elimina definitivamente ${p.name}`}><Trash2 className="h-4 w-4" /></button>
                    </>
                  )}
                </span>
              ),
            },
          ]}
        />
      )}
    </div>
  )
}
