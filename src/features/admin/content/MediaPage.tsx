import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ExternalLink, Pencil, Search, Shirt } from 'lucide-react'
import type { ProductImage } from '@/types/db'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { publicUrl } from '@/lib/storage'
import { invalidate, useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { Badge, EmptyState, PageHeader, Skeleton } from '@/components/ui/Display'
import { Input } from '@/components/ui/Form'
import { ProductImages } from '../catalog/ProductImages'

interface MediaProduct {
  id: string
  name: string
  slug: string
  is_published: boolean
  categories: { name: string } | null
  product_images: ProductImage[]
}

type Filter = 'published' | 'all' | 'missing'

/**
 * Foto dei prodotti raggruppate per prodotto. Sono le stesse della scheda "Immagini" del
 * prodotto: caricamento, ordine, immagine principale, testo alternativo e sostituzione.
 */
export default function MediaPage() {
  useMeta({ title: 'Media', noindex: true })
  const { data, loading, reload } = useQuery('admin:media-products', async () => {
    const { data: rows, error } = await supabase
      .from('products')
      .select('id,name,slug,is_published,categories(name),product_images(*)')
      .is('deleted_at', null)
      .order('sort_order')
      .order('name')
    if (error) throw error
    return (rows as unknown as MediaProduct[]).map((p) => ({
      ...p,
      product_images: [...(p.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    }))
  })
  const [filter, setFilter] = useState<Filter>('published')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const products = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (data ?? []).filter((p) =>
      (filter === 'all' || (filter === 'published' ? p.is_published : p.product_images.length === 0)) &&
      (!term || p.name.toLowerCase().includes(term) || (p.categories?.name ?? '').toLowerCase().includes(term)),
    )
  }, [data, filter, search])

  const counts = useMemo(() => ({
    published: (data ?? []).filter((p) => p.is_published).length,
    all: data?.length ?? 0,
    missing: (data ?? []).filter((p) => p.product_images.length === 0).length,
  }), [data])

  const changed = () => {
    invalidate('catalog:')
    invalidate('product:')
    invalidate('admin:products')
    void reload()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Media"
        description="Le foto dei prodotti, raggruppate per prodotto: sono quelle mostrate nel catalogo e nella pagina prodotto. La prima indicata come principale è la copertina."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-full bg-ink-100 p-1 text-sm font-semibold" role="tablist" aria-label="Filtra prodotti">
          {([['published', 'Pubblicati'], ['all', 'Tutti'], ['missing', 'Senza foto']] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={filter === k}
              onClick={() => setFilter(k)}
              className={cn('rounded-full px-4 py-1.5 transition', filter === k ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900')}
            >
              {label} <span className="font-mono text-xs text-ink-400">{counts[k]}</span>
            </button>
          ))}
        </div>
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca prodotto o categoria" aria-label="Cerca prodotto" className="pl-9" />
        </div>
      </div>

      {loading && !data ? (
        <div className="space-y-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : products.length === 0 ? (
        <EmptyState
          title={filter === 'missing' ? 'Tutti i prodotti hanno almeno una foto' : 'Nessun prodotto'}
          description={filter === 'published' ? 'I prodotti pubblicati compariranno qui con le loro foto.' : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {products.map((p) => {
            const isOpen = open === p.id
            const cover = p.product_images.find((i) => i.is_primary) ?? p.product_images[0]
            return (
              <li key={p.id} className="surface overflow-hidden">
                <div className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : p.id)}
                    aria-expanded={isOpen}
                    aria-controls={`media-${p.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left sm:gap-4"
                  >
                    <span className="flex h-14 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink-100 text-ink-300">
                      {cover ? <img src={publicUrl(cover.storage_path) ?? ''} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Shirt className="h-5 w-5" aria-hidden />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-ink-900">{p.name}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                        {p.categories?.name && <span>{p.categories.name}</span>}
                        <span className="font-mono">{p.product_images.length} foto</span>
                        {!p.is_published && <Badge>Bozza</Badge>}
                        {p.product_images.length === 0 && <Badge tone="danger">Senza foto</Badge>}
                      </span>
                    </span>
                    {/* anteprima delle altre foto */}
                    <span className="ml-auto hidden -space-x-3 md:flex" aria-hidden>
                      {p.product_images.slice(0, 5).map((im) => (
                        <img key={im.id} src={publicUrl(im.storage_path) ?? ''} alt="" loading="lazy" className="h-10 w-8 rounded-md object-cover ring-2 ring-white" />
                      ))}
                    </span>
                    <ChevronDown className={cn('h-5 w-5 shrink-0 text-ink-400 transition-transform', isOpen && 'rotate-180')} aria-hidden />
                  </button>
                  <Link to={`/admin/prodotti/${p.id}`} className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label={`Modifica ${p.name}`} title="Modifica prodotto">
                    <Pencil className="h-4 w-4" />
                  </Link>
                  {p.is_published && (
                    <a href={`/prodotti/${p.slug}`} target="_blank" rel="noopener noreferrer" className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label={`Apri ${p.name} sul sito`} title="Apri sul sito">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
                {isOpen && (
                  <div id={`media-${p.id}`} className="border-t border-ink-100 bg-ink-50/60 p-3 sm:p-5">
                    <ProductImages productId={p.id} images={p.product_images} onChanged={changed} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
