import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Search, SlidersHorizontal, X, PackageSearch } from 'lucide-react'
import type { Availability, ProductType, SupplyMode } from '@/types/db'
import { ON_DEMAND_NOTE, SUPPLY_LABEL } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useQuery } from '@/hooks/useQuery'
import { useDebounce } from '@/hooks/useDebounce'
import { useMeta } from '@/hooks/useMeta'
import { Input, Select } from '@/components/ui/Form'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Overlay'
import { EmptyState } from '@/components/ui/Display'
import { useSettings } from '@/features/settings/SettingsProvider'
import { listCategories, listGarmentTypes, listProducts, type ProductFilters } from './api'
import { ProductCard, ProductCardSkeleton } from './ProductCard'

const SORTS = [
  { value: 'default', label: 'In evidenza' },
  { value: 'newest', label: 'Novità' },
  { value: 'price_asc', label: 'Prezzo crescente' },
  { value: 'price_desc', label: 'Prezzo decrescente' },
  { value: 'name', label: 'Nome A–Z' },
] as const

export default function CatalogPage() {
  const { categorySlug } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { settings } = useSettings()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const debounced = useDebounce(search, 300)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const { data: categories } = useQuery('catalog:categories', listCategories, { staleMs: 5 * 60_000 })
  const { data: garmentTypes } = useQuery('catalog:garment-types', listGarmentTypes, { staleMs: 5 * 60_000 })

  const category = categories?.find((c) => c.slug === categorySlug) ?? null
  const topCategories = (categories ?? []).filter((c) => !c.parent_id)
  const subcategories = category ? (categories ?? []).filter((c) => c.parent_id === (category.parent_id ?? category.id)) : []

  // Sezione principale: disponibilità immediata o print-on-demand (?fornitura=immediata|on-demand)
  const supplyParam = params.get('fornitura')
  const supply: SupplyMode | undefined = supplyParam === 'immediata' ? 'immediate' : supplyParam === 'on-demand' ? 'on_demand' : undefined

  const attributeFilters = settings.catalog.filters ?? []
  const attrs = useMemo(() => {
    const o: Record<string, string> = {}
    for (const f of attributeFilters) {
      const v = params.get(`a.${f.key}`)
      if (v) o[f.key] = v
    }
    return o
  }, [params, attributeFilters])

  const filters: ProductFilters = {
    categoryIds: category
      ? [category.id, ...(categories ?? []).filter((c) => c.parent_id === category.id).map((c) => c.id)]
      : undefined,
    search: debounced,
    garmentTypeId: params.get('tipologia') || undefined,
    availability: (params.get('disponibilita') as Availability) || undefined,
    supplyMode: supply,
    productType: (params.get('tipo') as ProductType) || undefined,
    attributes: attrs,
    sort: (params.get('ordina') as ProductFilters['sort']) || 'default',
  }
  const key = categorySlug && !categories ? null : `catalog:products:${JSON.stringify(filters)}`
  const { data: products, loading, error, reload } = useQuery(key, () => listProducts(filters))

  // Valori disponibili per gli attributi configurati dall'admin
  const { data: allProducts } = useQuery(attributeFilters.length ? 'catalog:products:all' : null, () => listProducts({}))
  const attrValues = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const f of attributeFilters) {
      map[f.key] = [...new Set((allProducts ?? []).map((p) => p.attributes?.[f.key]).filter(Boolean) as string[])].sort()
    }
    return map
  }, [allProducts, attributeFilters])

  useEffect(() => {
    const next = new URLSearchParams(params)
    if (debounced) next.set('q', debounced)
    else next.delete('q')
    if (next.toString() !== params.toString()) setParams(next, { replace: true })
  }, [debounced]) // eslint-disable-line react-hooks/exhaustive-deps

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }

  const activeCount = ['tipologia', 'disponibilita', 'tipo', ...attributeFilters.map((f) => `a.${f.key}`)].filter((k) => params.get(k)).length

  useMeta({
    title: category ? category.name : 'Catalogo',
    description: category?.description || 'Catalogo New Major: divise, abbigliamento e kit da gara sportivi personalizzabili.',
  })

  const filterControls = (
    <div className="space-y-4">
      {(garmentTypes?.length ?? 0) > 0 && (
        <label className="block">
          <span className="text-sm font-medium">Tipologia maglia</span>
          <Select className="mt-1.5" value={params.get('tipologia') ?? ''} onChange={(e) => setParam('tipologia', e.target.value)}>
            <option value="">Tutte</option>
            {garmentTypes!.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
        </label>
      )}
      <label className="block">
        <span className="text-sm font-medium">Tipo prodotto</span>
        <Select className="mt-1.5" value={params.get('tipo') ?? ''} onChange={(e) => setParam('tipo', e.target.value)}>
          <option value="">Tutti</option>
          <option value="simple">Capi singoli</option>
          <option value="kit">Kit da gara</option>
        </Select>
      </label>
      <label className="block">
        <span className="text-sm font-medium">Disponibilità</span>
        <Select className="mt-1.5" value={params.get('disponibilita') ?? ''} onChange={(e) => setParam('disponibilita', e.target.value)}>
          <option value="">Qualsiasi</option>
          <option value="in_stock">Disponibile</option>
          <option value="on_request">Su richiesta</option>
        </Select>
      </label>
      {attributeFilters.map((f) => (attrValues[f.key]?.length ? (
        <label key={f.key} className="block">
          <span className="text-sm font-medium">{f.label}</span>
          <Select className="mt-1.5" value={params.get(`a.${f.key}`) ?? ''} onChange={(e) => setParam(`a.${f.key}`, e.target.value)}>
            <option value="">Tutti</option>
            {attrValues[f.key].map((v) => <option key={v} value={v}>{v}</option>)}
          </Select>
        </label>
      ) : null))}
      <label className="block">
        <span className="text-sm font-medium">Ordina per</span>
        <Select className="mt-1.5" value={params.get('ordina') ?? 'default'} onChange={(e) => setParam('ordina', e.target.value === 'default' ? '' : e.target.value)}>
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
      </label>
      {activeCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          icon={<X className="h-4 w-4" />}
          onClick={() => {
            const next = new URLSearchParams()
            if (params.get('q')) next.set('q', params.get('q')!)
            setParams(next, { replace: true })
          }}
        >
          Azzera filtri
        </Button>
      )}
    </div>
  )

  return (
    <div className="container py-8 sm:py-12">
      <nav aria-label="Percorso" className="text-sm text-ink-500">
        <Link to="/catalogo" className="hover:text-ink-900">Catalogo</Link>
        {category && <><span className="mx-2">/</span><span className="text-ink-900">{category.name}</span></>}
      </nav>
      <h1 className="display-lg mt-3 text-4xl sm:text-5xl">{category?.name ?? 'Catalogo'}</h1>
      {category?.description && <p className="mt-3 max-w-2xl text-ink-500">{category.description}</p>}

      {/* Sezioni principali: fornitura */}
      <div className="mt-8 grid grid-cols-3 gap-1 rounded-2xl bg-ink-100 p-1 sm:inline-grid sm:w-auto" role="tablist" aria-label="Sezioni del catalogo">
        {([['', 'Tutto'], ['immediata', SUPPLY_LABEL.immediate], ['on-demand', SUPPLY_LABEL.on_demand]] as const).map(([v, label]) => {
          const on = (supplyParam ?? '') === v || (!v && !supply)
          return (
            <button
              key={v || 'all'}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setParam('fornitura', v)}
              className={cn('min-h-11 rounded-xl px-3 py-2 text-xs font-semibold leading-tight transition-colors sm:px-5 sm:text-sm', on ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-600 hover:text-ink-900')}
            >
              {label}
            </button>
          )
        })}
      </div>
      {supply === 'on_demand' && <p className="mt-3 max-w-2xl text-sm text-ink-500">{ON_DEMAND_NOTE}</p>}

      {/* Categorie */}
      {topCategories.length > 0 && (
        <div className="no-scrollbar -mx-4 mt-8 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="navigation" aria-label="Categorie">
          <Chip active={!category} onClick={() => navigate({ pathname: '/catalogo', search: params.toString() })}>Tutti</Chip>
          {topCategories.map((c) => (
            <Chip key={c.id} active={category?.id === c.id || category?.parent_id === c.id} onClick={() => navigate({ pathname: `/catalogo/${c.slug}`, search: params.toString() })}>
              {c.name}
            </Chip>
          ))}
        </div>
      )}
      {subcategories.length > 0 && (
        <div className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {subcategories.map((c) => (
            <Chip key={c.id} small active={category?.id === c.id} onClick={() => navigate({ pathname: `/catalogo/${c.slug}`, search: params.toString() })}>
              {c.name}
            </Chip>
          ))}
        </div>
      )}

      <div className="mt-6 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca prodotti…"
            aria-label="Cerca nel catalogo"
            className="pl-10"
          />
        </div>
        <Button variant="secondary" className="lg:hidden" onClick={() => setFiltersOpen(true)} icon={<SlidersHorizontal className="h-4 w-4" />}>
          Filtri{activeCount ? ` (${activeCount})` : ''}
        </Button>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[15rem_1fr]">
        <aside className="hidden lg:block" aria-label="Filtri">
          <div className="sticky top-24">{filterControls}</div>
        </aside>
        <div>
          <p className="mb-4 text-sm text-ink-500" aria-live="polite">
            {loading && !error ? 'Caricamento…' : products ? `${products.length} ${products.length === 1 ? 'prodotto' : 'prodotti'}` : ''}
          </p>
          {error && !products ? (
            <EmptyState
              title="Impossibile caricare il catalogo"
              description="Controlla la connessione e riprova."
              action={<Button variant="secondary" onClick={() => void reload()}>Riprova</Button>}
            />
          ) : loading && !products ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <ProductCardSkeleton key={i} />)}</div>
          ) : products?.length ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3">
              {products.map((p, i) => <ProductCard key={p.id} product={p} eager={i < 3} />)}
            </div>
          ) : (
            <EmptyState
              icon={<PackageSearch className="h-6 w-6" />}
              title={supply && !search && !activeCount && !category ? `Nessun articolo ${supply === 'on_demand' ? 'print-on-demand' : 'in disponibilità immediata'} al momento` : 'Nessun prodotto trovato'}
              description={search || activeCount ? 'Prova a modificare la ricerca o i filtri.' : supply ? 'Guarda l’altra sezione del catalogo o contattaci per richieste su misura.' : 'Il catalogo è in allestimento. Contattaci per richieste su misura.'}
              action={!search && !activeCount ? <Button variant="secondary" onClick={() => navigate('/contatti')}>Contattaci</Button> : undefined}
            />
          )}
        </div>
      </div>

      <Drawer open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filtri" footer={<Button className="w-full" onClick={() => setFiltersOpen(false)}>Mostra risultati</Button>}>
        <div className="p-5">{filterControls}</div>
      </Drawer>
    </div>
  )
}

function Chip({ active, onClick, children, small }: { active: boolean; onClick: () => void; children: React.ReactNode; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'shrink-0 rounded-full border font-semibold transition-colors',
        small ? 'h-9 px-3.5 text-xs' : 'h-10 px-4 text-sm',
        active ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400',
      )}
    >
      {children}
    </button>
  )
}
