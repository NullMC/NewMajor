import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Plus, Trash2 } from 'lucide-react'
import type { ProductDetail } from '@/types/db'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { formatPrice } from '@/lib/format'
import { invalidate, useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, EmptyState } from '@/components/ui/Display'
import { FormError, Input, Select } from '@/components/ui/Form'
import { PageLoader } from '@/components/ui/Spinner'
import { Tabs } from '@/components/ui/Tabs'
import { useUi } from '@/components/ui/Toast'
import { useSettings } from '@/features/settings/SettingsProvider'
import { listCategories, listGarmentTypes } from '@/features/catalog/api'
import { SHAPE_LABEL } from '@/features/configurator/garment/shapes'
import { FieldGrid, validateFields, type FieldDef } from '../components/fields'
import { ChildRowsEditor } from '../components/ChildRowsEditor'
import { adminGetProduct, adminListProducts, isFeatured } from './api'
import { ProductImages } from './ProductImages'
import { AreaCanvasEditor } from './AreaCanvasEditor'

type TabKey = 'general' | 'images' | 'configurator' | 'areas' | 'kit' | 'pricing' | 'related'

const SHAPES = Object.entries(SHAPE_LABEL).map(([value, label]) => ({ value, label }))
const AREA_TYPES = [
  { value: 'logo', label: 'Logo' }, { value: 'sponsor', label: 'Sponsor' }, { value: 'all_over', label: 'Grafica all-over' },
  { value: 'text', label: 'Nome (testo)' }, { value: 'number', label: 'Numero' },
]

const emptyProduct = {
  name: '', slug: '', category_id: null, short_description: '', description: '', product_type: 'simple', base_price: 0,
  availability: 'in_stock', is_configurable: true, model_shape: 'tshirt', sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  min_quantity: 1, is_published: false, sort_order: 0, seo_title: '', seo_description: '', attributes: {},
} as Record<string, unknown>

export default function ProductEditPage() {
  const { id = '' } = useParams()
  const isNew = id === 'nuovo'
  const navigate = useNavigate()
  const { toast } = useUi()
  const { settings } = useSettings()
  const { data: product, loading, reload } = useQuery(isNew ? null : `admin:product:${id}`, () => adminGetProduct(id))
  const { data: categories } = useQuery('catalog:categories', listCategories)
  const { data: garmentTypes } = useQuery('admin:garment_types:list', listGarmentTypes)
  const [tab, setTab] = useState<TabKey>('general')
  const [values, setValues] = useState<Record<string, unknown>>(emptyProduct)
  const [featured, setFeatured] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useMeta({ title: isNew ? 'Nuovo prodotto' : product?.name ?? 'Prodotto', noindex: true })

  useEffect(() => {
    if (product) setValues({ ...product })
    if (!isNew && id) void isFeatured(id).then(setFeatured)
  }, [product, isNew, id])

  const refresh = () => {
    invalidate('catalog:')
    invalidate('product:')
    invalidate('admin:products')
    void reload()
  }

  const generalFields: FieldDef[] = useMemo(() => [
    { key: 'name', label: 'Nome', type: 'text', required: true },
    { key: 'slug', label: 'Slug (URL)', type: 'slug', from: 'name', required: true, hint: '/prodotti/slug' },
    { key: 'category_id', label: 'Categoria', type: 'select', options: (categories ?? []).map((c) => ({ value: c.id, label: c.parent_id ? `— ${c.name}` : c.name })) },
    { key: 'product_type', label: 'Tipo', type: 'select', required: true, options: [{ value: 'simple', label: 'Capo singolo' }, { value: 'kit', label: 'Kit composto' }] },
    { key: 'base_price', label: 'Prezzo base (€ / capo o kit)', type: 'number', step: 0.01, min: 0, required: true },
    { key: 'min_quantity', label: 'Quantità minima', type: 'number', step: 1, min: 1 },
    { key: 'availability', label: 'Disponibilità', type: 'select', required: true, options: [{ value: 'in_stock', label: 'Disponibile' }, { value: 'on_request', label: 'Su richiesta' }, { value: 'out_of_stock', label: 'Non disponibile' }] },
    { key: 'model_shape', label: 'Modello 3D', type: 'select', required: true, options: SHAPES, hint: 'Sagoma usata per il mockup (per i kit: modello del componente principale)' },
    { key: 'sizes', label: 'Taglie', type: 'tags', hint: 'Separate da virgola. Per i kit si impostano sui componenti.' },
    { key: 'sort_order', label: 'Ordine nel catalogo', type: 'number', step: 1 },
    { key: 'is_configurable', label: 'Personalizzabile (badge e testi)', type: 'boolean' },
    { key: 'is_published', label: 'Pubblicato', type: 'boolean' },
    { key: 'short_description', label: 'Descrizione breve', type: 'textarea' },
    { key: 'description', label: 'Descrizione completa', type: 'markdown' },
    { key: 'seo_title', label: 'Titolo SEO', type: 'text', hint: 'Facoltativo (default: nome)' },
    { key: 'seo_description', label: 'Meta description', type: 'text', hint: 'Facoltativa (default: descrizione breve)' },
  ], [categories])

  const saveGeneral = async () => {
    const err = validateFields(generalFields, values)
    if (err) return setError(err)
    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = { attributes: values.attributes ?? {} }
      for (const f of generalFields) payload[f.key] = values[f.key] ?? null
      payload.short_description = payload.short_description || null
      payload.seo_title = payload.seo_title || null
      payload.seo_description = payload.seo_description || null
      if (isNew) {
        const { data, error: e } = await supabase.from('products').insert(payload).select('id').single()
        if (e) throw e
        invalidate('admin:products')
        toast('Prodotto creato. Ora aggiungi immagini e personalizzazioni.')
        navigate(`/admin/prodotti/${data.id}`, { replace: true })
      } else {
        const { error: e } = await supabase.from('products').update(payload).eq('id', id)
        if (e) throw e
        refresh()
        toast('Prodotto salvato')
      }
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const toggleFeatured = async () => {
    try {
      if (featured) await supabase.from('featured_products').delete().eq('product_id', id)
      else {
        const { error: e } = await supabase.from('featured_products').insert({ product_id: id, sort_order: 999 })
        if (e) throw e
      }
      setFeatured(!featured)
      invalidate('catalog:featured')
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  if (!isNew && loading && !product) return <PageLoader />
  if (!isNew && !product) return <EmptyState title="Prodotto non trovato" action={<Button onClick={() => navigate('/admin/prodotti')}>Torna ai prodotti</Button>} />

  const p = product as ProductDetail | undefined
  const isKit = values.product_type === 'kit'
  const tabs = [
    { value: 'general' as const, label: 'Generale' },
    ...(!isNew ? [
      { value: 'images' as const, label: 'Immagini', count: p?.product_images?.length },
      { value: 'configurator' as const, label: 'Tipologie, colori, opzioni' },
      { value: 'areas' as const, label: 'Aree personalizzazione', count: p?.customization_areas.length },
      ...(isKit ? [{ value: 'kit' as const, label: 'Componenti kit', count: p?.kit_items.length }] : []),
      { value: 'pricing' as const, label: 'Sconti quantità' },
      { value: 'related' as const, label: 'Correlati' },
    ] : []),
  ]

  return (
    <div className="space-y-6">
      <Link to="/admin/prodotti" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-900"><ArrowLeft className="h-4 w-4" /> Prodotti</Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">{isNew ? 'Nuovo prodotto' : p?.name}</h1>
        {!isNew && p && (
          <div className="flex flex-wrap gap-2">
            <Button variant={featured ? 'accent' : 'secondary'} size="sm" onClick={() => void toggleFeatured()}>{featured ? 'In evidenza in home' : 'Metti in evidenza'}</Button>
            <a href={`/prodotti/${p.slug}`} target="_blank" rel="noopener" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3 text-sm font-semibold hover:border-ink-400"><ExternalLink className="h-4 w-4" /> Anteprima</a>
          </div>
        )}
      </div>
      <Tabs ariaLabel="Sezioni prodotto" value={tab} onChange={setTab} items={tabs} />

      {tab === 'general' && (
        <Card className="p-5">
          <FieldGrid fields={generalFields} values={values} onChange={(patch) => setValues((v) => ({ ...v, ...patch }))} />
          <AttributesEditor
            value={(values.attributes as Record<string, string>) ?? {}}
            filterKeys={settings.catalog.filters ?? []}
            onChange={(attributes) => setValues((v) => ({ ...v, attributes }))}
          />
          <FormError message={error} />
          <div className="mt-5 flex justify-end"><Button loading={saving} onClick={saveGeneral}>{isNew ? 'Crea prodotto' : 'Salva'}</Button></div>
        </Card>
      )}

      {tab === 'images' && p && <ProductImages productId={p.id} images={p.product_images ?? []} onChanged={refresh} />}

      {tab === 'configurator' && p && (
        <div className="space-y-6">
          <GarmentTypesEditor product={p} all={garmentTypes ?? []} onChanged={refresh} />
          <Card>
            <CardHeader title="Colori base (varianti)" description="Colore principale e secondario (profili collo e maniche) del capo." />
            <div className="p-5">
              <ChildRowsEditor
                table="product_variants" parentKey="product_id" parentId={p.id} rows={p.product_variants as unknown as Record<string, unknown>[]}
                defaults={{ name: '', color_hex: '#FFFFFF', secondary_hex: null, price_delta: 0, is_active: true }}
                addLabel="Aggiungi colore" onChanged={refresh} emptyText="Nessun colore: il capo verrà mostrato in bianco."
                title={(r) => <span className="inline-flex items-center gap-2"><span className="h-4 w-4 rounded-full border" style={{ background: String(r.color_hex ?? '#fff') }} />{String(r.name || 'Nuovo colore')}</span>}
                fields={[
                  { key: 'name', label: 'Nome', type: 'text', required: true },
                  { key: 'sku', label: 'Codice', type: 'text' },
                  { key: 'color_hex', label: 'Colore principale', type: 'color', required: true },
                  { key: 'secondary_hex', label: 'Colore profili', type: 'color' },
                  { key: 'price_delta', label: 'Sovrapprezzo (€)', type: 'number', step: 0.01 },
                  { key: 'is_active', label: 'Attivo', type: 'boolean' },
                ]}
              />
            </div>
          </Card>
          <Card>
            <CardHeader title="Opzioni" description="Scelte aggiuntive (es. tessuto, collo, maniche) con eventuali sovrapprezzi." />
            <div className="p-5">
              <ChildRowsEditor
                table="product_options" parentKey="product_id" parentId={p.id} rows={p.product_options.map(({ product_option_values: _v, ...o }) => o) as unknown as Record<string, unknown>[]}
                defaults={{ name: '', help_text: '', is_required: false, is_multiple: false }}
                addLabel="Aggiungi opzione" onChanged={refresh}
                title={(r) => String(r.name || 'Nuova opzione')}
                fields={[
                  { key: 'name', label: 'Nome opzione', type: 'text', required: true },
                  { key: 'help_text', label: 'Aiuto per il cliente', type: 'text' },
                  { key: 'is_required', label: 'Obbligatoria', type: 'boolean' },
                  { key: 'is_multiple', label: 'Selezione multipla', type: 'boolean' },
                ]}
                renderExtra={(row) => {
                  const opt = p.product_options.find((o) => o.id === row.id)
                  return (
                    <div className="mt-4 border-t border-ink-100 pt-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-500">Valori</p>
                      <ChildRowsEditor
                        table="product_option_values" parentKey="option_id" parentId={String(row.id)} rows={(opt?.product_option_values ?? []) as unknown as Record<string, unknown>[]}
                        defaults={{ label: '', price_delta: 0, color_hex: null, is_active: true }}
                        addLabel="Aggiungi valore" onChanged={refresh}
                        title={(r) => String(r.label || 'Nuovo valore')}
                        fields={[
                          { key: 'label', label: 'Valore', type: 'text', required: true },
                          { key: 'price_delta', label: 'Sovrapprezzo (€)', type: 'number', step: 0.01 },
                          { key: 'color_hex', label: 'Colore (facoltativo)', type: 'color' },
                          { key: 'is_active', label: 'Attivo', type: 'boolean' },
                        ]}
                      />
                    </div>
                  )
                }}
              />
            </div>
          </Card>
        </div>
      )}

      {tab === 'areas' && p && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
            {isKit && p.kit_items.length > 0 ? (
              <KitAreaPreview product={p} onChanged={refresh} />
            ) : (
              <AreaCanvasEditor shape={p.model_shape} areas={p.customization_areas} onChanged={refresh} />
            )}
          </div>
          <ChildRowsEditor
            table="customization_areas" parentKey="product_id" parentId={p.id} rows={p.customization_areas as unknown as Record<string, unknown>[]}
            defaults={{ name: '', side: 'front', area_type: 'logo', x: 40, y: 25, width: 20, height: 15, print_width_cm: 10, print_height_cm: 8, price_delta: 0, max_chars: null, is_required: false, allow_library: true, allow_upload: true, is_active: true, kit_item_id: null }}
            addLabel="Aggiungi area" onChanged={refresh} emptyText="Nessuna area: aggiungi le zone in cui il cliente può inserire loghi, sponsor, grafiche, nomi e numeri."
            title={(r) => `${String(r.name || 'Nuova area')} · ${r.side === 'back' ? 'Retro' : 'Fronte'}`}
            fields={[
              { key: 'name', label: 'Nome area', type: 'text', required: true, hint: 'Es. Logo cuore, Sponsor petto, Nome retro' },
              { key: 'area_type', label: 'Tipo', type: 'select', required: true, options: AREA_TYPES },
              { key: 'side', label: 'Lato', type: 'select', required: true, options: [{ value: 'front', label: 'Fronte' }, { value: 'back', label: 'Retro' }] },
              ...(isKit ? [{ key: 'kit_item_id', label: 'Componente kit', type: 'select' as const, options: p.kit_items.map((k) => ({ value: k.id, label: k.label })), hint: 'Vuoto = primo componente' }] : []),
              { key: 'x', label: 'X (%)', type: 'number', min: 0, max: 100, step: 0.1 },
              { key: 'y', label: 'Y (%)', type: 'number', min: 0, max: 100, step: 0.1 },
              { key: 'width', label: 'Larghezza (%)', type: 'number', min: 1, max: 100, step: 0.1 },
              { key: 'height', label: 'Altezza (%)', type: 'number', min: 1, max: 100, step: 0.1 },
              { key: 'print_width_cm', label: 'Larghezza stampa (cm)', type: 'number', min: 0.5, step: 0.1, hint: 'Usata per calcolare i dpi effettivi' },
              { key: 'print_height_cm', label: 'Altezza stampa (cm)', type: 'number', min: 0.5, step: 0.1 },
              { key: 'price_delta', label: 'Sovrapprezzo a capo (€)', type: 'number', step: 0.01 },
              { key: 'max_chars', label: 'Max caratteri (nomi/numeri)', type: 'number', min: 1, max: 40, step: 1, nullable: true },
              { key: 'is_required', label: 'Obbligatoria', type: 'boolean' },
              { key: 'is_active', label: 'Attiva', type: 'boolean' },
              { key: 'allow_upload', label: 'Consenti upload cliente', type: 'boolean' },
              { key: 'allow_library', label: 'Consenti libreria grafiche', type: 'boolean' },
            ]}
          />
        </div>
      )}

      {tab === 'kit' && p && (
        <Card>
          <CardHeader title="Componenti del kit" description="Ogni componente può avere taglie proprie e un modello 3D dedicato. Il prezzo del kit è il prezzo base del prodotto." />
          <div className="p-5">
            <KitItemsEditor product={p} onChanged={refresh} />
          </div>
        </Card>
      )}

      {tab === 'pricing' && p && (
        <Card>
          <CardHeader title="Sconti a scaglioni" description={`Sconto percentuale applicato al totale della riga quando la quantità raggiunge la soglia. Prezzo base: ${formatPrice(p.base_price)}.`} />
          <div className="p-5">
            <ChildRowsEditor
              table="price_tiers" parentKey="product_id" parentId={p.id} rows={p.price_tiers as unknown as Record<string, unknown>[]} sortable={false}
              defaults={{ min_quantity: 10, discount_percent: 5 }}
              addLabel="Aggiungi scaglione" onChanged={refresh} emptyText="Nessuno sconto quantità."
              title={(r) => `Da ${r.min_quantity ?? '?'} pezzi`}
              fields={[
                { key: 'min_quantity', label: 'Quantità minima', type: 'number', min: 1, step: 1, required: true },
                { key: 'discount_percent', label: 'Sconto (%)', type: 'number', min: 0, max: 99, step: 0.5, required: true },
              ]}
            />
          </div>
        </Card>
      )}

      {tab === 'related' && p && <RelatedEditor product={p} />}
    </div>
  )
}

function AttributesEditor({ value, onChange, filterKeys }: { value: Record<string, string>; onChange: (v: Record<string, string>) => void; filterKeys: { key: string; label: string }[] }) {
  const entries = Object.entries(value)
  const missing = filterKeys.filter((f) => !(f.key in value))
  return (
    <div className="mt-6 border-t border-ink-100 pt-5">
      <p className="text-sm font-semibold">Attributi filtrabili</p>
      <p className="mt-0.5 text-xs text-ink-500">I filtri del catalogo si configurano in Impostazioni → Catalogo. Qui indichi il valore per questo prodotto.</p>
      <div className="mt-3 space-y-2">
        {entries.map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <Input value={filterKeys.find((f) => f.key === k)?.label ?? k} readOnly className="max-w-[12rem] bg-ink-50" aria-label="Attributo" />
            <Input value={v} onChange={(e) => onChange({ ...value, [k]: e.target.value })} aria-label={`Valore ${k}`} />
            <button type="button" onClick={() => { const n = { ...value }; delete n[k]; onChange(n) }} className="rounded-lg p-2 text-ink-400 hover:text-danger-600" aria-label={`Rimuovi ${k}`}><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        {missing.length > 0 && (
          <Select value="" onChange={(e) => e.target.value && onChange({ ...value, [e.target.value]: '' })} className="max-w-xs" aria-label="Aggiungi attributo">
            <option value="">+ Aggiungi attributo…</option>
            {missing.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </Select>
        )}
        {!filterKeys.length && !entries.length && <p className="text-xs text-ink-400">Nessun filtro configurato.</p>}
      </div>
    </div>
  )
}

function GarmentTypesEditor({ product, all, onChanged }: { product: ProductDetail; all: { id: string; name: string; price_delta: number; is_active: boolean }[]; onChanged: () => void }) {
  const { toast } = useUi()
  const linked = new Map((product.product_garment_types ?? []).map((g) => [g.garment_type_id, g]))
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const toggle = async (gid: string, on: boolean) => {
    const { error } = on
      ? await supabase.from('product_garment_types').insert({ product_id: product.id, garment_type_id: gid, sort_order: linked.size * 10 })
      : await supabase.from('product_garment_types').delete().eq('product_id', product.id).eq('garment_type_id', gid)
    if (error) toast(errorMessage(error), 'error')
    onChanged()
  }
  const saveOverride = async (gid: string) => {
    const raw = overrides[gid]
    if (raw === undefined) return
    const { error } = await supabase.from('product_garment_types').update({ price_delta: raw === '' ? null : Number(raw) }).eq('product_id', product.id).eq('garment_type_id', gid)
    if (error) toast(errorMessage(error), 'error')
    else onChanged()
  }
  return (
    <Card>
      <CardHeader title="Tipologie di capo" description={<>Tipologie selezionabili dal cliente per questo prodotto. Gestisci l’elenco in <Link to="/admin/tipologie" className="underline">Tipologie capo</Link>.</>} />
      <ul className="divide-y divide-ink-100">
        {all.map((g) => {
          const l = linked.get(g.id)
          return (
            <li key={g.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <label className="flex flex-1 items-center gap-3 text-sm font-medium">
                <input type="checkbox" className="h-5 w-5 accent-ink-900" checked={!!l} onChange={(e) => void toggle(g.id, e.target.checked)} />
                {g.name}{!g.is_active && <span className="text-xs text-ink-400">(disattiva)</span>}
              </label>
              {l && (
                <label className="flex items-center gap-2 text-xs text-ink-500">
                  Sovrapprezzo €
                  <Input
                    type="number" step="0.01" className="h-9 w-24 text-sm"
                    placeholder={String(g.price_delta)}
                    value={overrides[g.id] ?? (l.price_delta === null ? '' : String(l.price_delta))}
                    onChange={(e) => setOverrides({ ...overrides, [g.id]: e.target.value })}
                    onBlur={() => void saveOverride(g.id)}
                    aria-label={`Sovrapprezzo ${g.name}`}
                  />
                </label>
              )}
            </li>
          )
        })}
        {!all.length && <li className="px-5 py-4 text-sm text-ink-500">Nessuna tipologia definita.</li>}
      </ul>
    </Card>
  )
}

function KitItemsEditor({ product, onChanged }: { product: ProductDetail; onChanged: () => void }) {
  const { data: products } = useQuery('admin:products:active', () => adminListProducts(false))
  return (
    <ChildRowsEditor
      table="kit_items" parentKey="kit_id" parentId={product.id} rows={product.kit_items as unknown as Record<string, unknown>[]}
      defaults={{ label: '', component_product_id: null, model_shape: 'tshirt', quantity: 1, sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] }}
      addLabel="Aggiungi componente" onChanged={onChanged} emptyText="Aggiungi i capi che compongono il kit (es. maglia, pantaloncino, calzettoni)."
      title={(r) => String(r.label || 'Nuovo componente')}
      fields={[
        { key: 'label', label: 'Nome componente', type: 'text', required: true },
        { key: 'model_shape', label: 'Modello 3D', type: 'select', options: SHAPES },
        { key: 'quantity', label: 'Pezzi per kit', type: 'number', min: 1, step: 1 },
        { key: 'component_product_id', label: 'Prodotto collegato (facoltativo)', type: 'select', options: (products ?? []).filter((x) => x.id !== product.id).map((x) => ({ value: x.id, label: x.name })) },
        { key: 'sizes', label: 'Taglie', type: 'tags', span: 2 },
      ]}
    />
  )
}

function KitAreaPreview({ product, onChanged }: { product: ProductDetail; onChanged: () => void }) {
  const [kitId, setKitId] = useState(product.kit_items[0]?.id)
  const item = product.kit_items.find((k) => k.id === kitId) ?? product.kit_items[0]
  const first = product.kit_items[0]?.id
  const areas = product.customization_areas.filter((a) => (a.kit_item_id ?? first) === item?.id)
  return (
    <div className="space-y-3">
      <Select value={kitId} onChange={(e) => setKitId(e.target.value)} aria-label="Componente">
        {product.kit_items.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
      </Select>
      <AreaCanvasEditor shape={item?.model_shape ?? product.model_shape} areas={areas} onChanged={onChanged} />
    </div>
  )
}

function RelatedEditor({ product }: { product: ProductDetail }) {
  const { toast } = useUi()
  const { data: products } = useQuery('admin:products:active', () => adminListProducts(false))
  const { data: related, reload } = useQuery(`admin:related:${product.id}`, async () => {
    const { data, error } = await supabase.from('related_products').select('related_id,sort_order').eq('product_id', product.id).order('sort_order')
    if (error) throw error
    return data as { related_id: string; sort_order: number }[]
  })
  const [pick, setPick] = useState('')
  const ids = new Set((related ?? []).map((r) => r.related_id))
  const add = async () => {
    if (!pick) return
    const { error } = await supabase.from('related_products').insert({ product_id: product.id, related_id: pick, sort_order: (related?.length ?? 0) * 10 })
    if (error) toast(errorMessage(error), 'error')
    setPick('')
    invalidate(`related:${product.id}`)
    void reload()
  }
  const remove = async (rid: string) => {
    await supabase.from('related_products').delete().eq('product_id', product.id).eq('related_id', rid)
    invalidate(`related:${product.id}`)
    void reload()
  }
  return (
    <Card>
      <CardHeader title="Prodotti correlati" description="Mostrati in fondo alla pagina prodotto." />
      <div className="space-y-4 p-5">
        <div className="flex gap-2">
          <Select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Prodotto da aggiungere">
            <option value="">Seleziona un prodotto…</option>
            {(products ?? []).filter((x) => x.id !== product.id && !ids.has(x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => void add()} disabled={!pick}>Aggiungi</Button>
        </div>
        <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200">
          {(related ?? []).map((r) => (
            <li key={r.related_id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              {(products ?? []).find((x) => x.id === r.related_id)?.name ?? r.related_id}
              <button type="button" onClick={() => void remove(r.related_id)} className="rounded-lg p-1.5 text-ink-400 hover:text-danger-600" aria-label="Rimuovi"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
          {!related?.length && <li className="px-4 py-3 text-sm text-ink-500">Nessun prodotto correlato.</li>}
        </ul>
      </div>
    </Card>
  )
}
