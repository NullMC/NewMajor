import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { Product } from '@/types/db'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { removePublic } from '@/lib/storage'
import { invalidate, useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, PageHeader, Skeleton } from '@/components/ui/Display'
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/Form'
import { useUi } from '@/components/ui/Toast'
import type { HeroContent, HomeSections, SiteBanner } from '@/features/content/api'
import { ImageInput, ReorderButtons } from '../components/fields'
import { adminListProducts } from '../catalog/api'

type Content = { hero: HeroContent; sections: HomeSections; featured: { title: string; subtitle: string }; banner: SiteBanner }

const KEYS = { hero: 'home.hero', sections: 'home.sections', featured: 'home.featured', banner: 'site.banner' } as const

function ListEditor({ items, onChange, label }: { items: string[]; onChange: (v: string[]) => void; label: string }) {
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex gap-2">
          <Input value={it} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`${label} ${i + 1}`} />
          <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="rounded-lg p-2 text-ink-400 hover:text-danger-600" aria-label="Rimuovi"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => onChange([...items, ''])}>Aggiungi</Button>
    </div>
  )
}

function FeaturedManager() {
  const { toast } = useUi()
  const { data: products } = useQuery('admin:products:active', () => adminListProducts(false))
  const { data: featured, reload } = useQuery('admin:featured', async () => {
    const { data, error } = await supabase.from('featured_products').select('product_id,sort_order').order('sort_order')
    if (error) throw error
    return data as { product_id: string; sort_order: number }[]
  })
  const [pick, setPick] = useState('')
  const after = () => { invalidate('catalog:featured'); void reload() }
  const nameOf = (id: string) => (products ?? []).find((p: Product) => p.id === id)
  const add = async () => {
    if (!pick) return
    const { error } = await supabase.from('featured_products').insert({ product_id: pick, sort_order: ((featured?.length ?? 0) + 1) * 10 })
    if (error) toast(errorMessage(error), 'error')
    setPick('')
    after()
  }
  const move = async (i: number, dir: -1 | 1) => {
    const list = [...(featured ?? [])]
    const j = i + dir
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    await Promise.all(list.map((f, idx) => supabase.from('featured_products').update({ sort_order: (idx + 1) * 10 }).eq('product_id', f.product_id)))
    after()
  }
  return (
    <Card>
      <CardHeader title="Prodotti in evidenza" description="Mostrati in home nell’ordine indicato (solo se pubblicati)." />
      <div className="space-y-3 p-5">
        <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200">
          {(featured ?? []).map((f, i) => {
            const p = nameOf(f.product_id)
            return (
              <li key={f.product_id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <ReorderButtons label={p?.name ?? ''} onUp={() => void move(i, -1)} onDown={() => void move(i, 1)} disabledUp={i === 0} disabledDown={i === (featured?.length ?? 0) - 1} />
                <span className="flex-1">{p?.name ?? '…'}{p && !p.is_published && <span className="ml-2 text-xs text-warning-700">(non pubblicato)</span>}</span>
                <button type="button" onClick={async () => { await supabase.from('featured_products').delete().eq('product_id', f.product_id); after() }} className="rounded-lg p-1.5 text-ink-400 hover:text-danger-600" aria-label="Rimuovi"><Trash2 className="h-4 w-4" /></button>
              </li>
            )
          })}
          {!featured?.length && <li className="px-3 py-3 text-sm text-ink-500">Nessun prodotto in evidenza: la sezione non viene mostrata.</li>}
        </ul>
        <div className="flex gap-2">
          <Select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Prodotto da aggiungere">
            <option value="">Aggiungi un prodotto…</option>
            {(products ?? []).filter((p) => !(featured ?? []).some((f) => f.product_id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Button onClick={() => void add()} disabled={!pick}>Aggiungi</Button>
        </div>
      </div>
    </Card>
  )
}

export default function HomeContentPage() {
  useMeta({ title: 'Home e banner', noindex: true })
  const { toast } = useUi()
  const { data, loading } = useQuery('admin:site_content', async () => {
    const { data: rows, error } = await supabase.from('site_content').select('key,value').in('key', Object.values(KEYS))
    if (error) throw error
    return Object.fromEntries((rows ?? []).map((r) => [r.key, r.value])) as Record<string, unknown>
  })
  const [c, setC] = useState<Content | null>(null)
  const [originalImage, setOriginalImage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!data) return
    const hero = (data[KEYS.hero] ?? { title: '', subtitle: '' }) as HeroContent
    setOriginalImage(hero.image_path ?? null)
    setC({
      hero,
      sections: (data[KEYS.sections] ?? {}) as HomeSections,
      featured: { title: '', subtitle: '', ...(data[KEYS.featured] as object) },
      banner: { enabled: false, text: '', link: '', ...(data[KEYS.banner] as object) },
    })
  }, [data])

  if (loading || !c) return <Skeleton className="h-96" />

  const s = c.sections
  const setS = (patch: Partial<HomeSections>) => setC({ ...c, sections: { ...s, ...patch } })
  const steps = s.process?.steps ?? []

  const save = async () => {
    setSaving(true)
    try {
      const rows = [
        { key: KEYS.hero, value: c.hero },
        { key: KEYS.sections, value: c.sections },
        { key: KEYS.featured, value: c.featured },
        { key: KEYS.banner, value: c.banner },
      ]
      const { error } = await supabase.from('site_content').upsert(rows)
      if (error) throw error
      if (originalImage && originalImage !== c.hero.image_path) await removePublic([originalImage]).catch(() => undefined)
      setOriginalImage(c.hero.image_path ?? null)
      invalidate('content:')
      toast('Contenuti pubblicati')
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  const text = (label: string, value: string | undefined, onChange: (v: string) => void, area = false) => (
    <Field label={label}>{area ? <Textarea rows={3} value={value ?? ''} onChange={(e) => onChange(e.target.value)} /> : <Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} />}</Field>
  )

  return (
    <div className="space-y-6">
      <PageHeader title="Home e banner" description="Testi, immagini e sezioni della home page. Le sezioni senza titolo non vengono mostrate." actions={<Button loading={saving} onClick={() => void save()}>Salva e pubblica</Button>} />

      <Card>
        <CardHeader title="Banner annunci" description="Barra sottile in cima a tutte le pagine (es. saldi, chiusure, avvisi)." />
        <div className="grid gap-4 p-5 sm:grid-cols-[auto_1fr_16rem] sm:items-end">
          <div className="flex h-11 items-center gap-3"><Switch label="Banner attivo" checked={c.banner.enabled} onChange={(v) => setC({ ...c, banner: { ...c.banner, enabled: v } })} /><span className="text-sm">Attivo</span></div>
          {text('Testo', c.banner.text, (v) => setC({ ...c, banner: { ...c.banner, text: v } }))}
          {text('Link (facoltativo)', c.banner.link, (v) => setC({ ...c, banner: { ...c.banner, link: v } }))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Hero" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">{text('Titolo', c.hero.title, (v) => setC({ ...c, hero: { ...c.hero, title: v } }))}</div>
          <div className="sm:col-span-2">{text('Sottotitolo', c.hero.subtitle, (v) => setC({ ...c, hero: { ...c.hero, subtitle: v } }), true)}</div>
          {text('Pulsante principale — testo', c.hero.cta_primary?.label, (v) => setC({ ...c, hero: { ...c.hero, cta_primary: { href: c.hero.cta_primary?.href ?? '/catalogo', label: v } } }))}
          {text('Pulsante principale — link', c.hero.cta_primary?.href, (v) => setC({ ...c, hero: { ...c.hero, cta_primary: { label: c.hero.cta_primary?.label ?? '', href: v } } }))}
          {text('Pulsante secondario — testo', c.hero.cta_secondary?.label, (v) => setC({ ...c, hero: { ...c.hero, cta_secondary: { href: c.hero.cta_secondary?.href ?? '/contatti', label: v } } }))}
          {text('Pulsante secondario — link', c.hero.cta_secondary?.href, (v) => setC({ ...c, hero: { ...c.hero, cta_secondary: { label: c.hero.cta_secondary?.label ?? '', href: v } } }))}
          <Field label="Immagine hero" hint="Facoltativa: se assente viene mostrata l’illustrazione vettoriale delle maglie" className="sm:col-span-2">
            <ImageInput value={c.hero.image_path ?? null} onChange={(p) => setC({ ...c, hero: { ...c.hero, image_path: p } })} folder="site" />
          </Field>
        </div>
      </Card>

      <FeaturedManager />
      <Card>
        <CardHeader title="Intestazione prodotti in evidenza" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {text('Titolo', c.featured.title, (v) => setC({ ...c, featured: { ...c.featured, title: v } }))}
          {text('Sottotitolo', c.featured.subtitle, (v) => setC({ ...c, featured: { ...c.featured, subtitle: v } }))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Sezione personalizzazione" />
        <div className="space-y-4 p-5">
          {text('Titolo', s.personalization?.title, (v) => setS({ personalization: { text: '', points: [], ...s.personalization, title: v } }))}
          {text('Testo', s.personalization?.text, (v) => setS({ personalization: { title: '', points: [], ...s.personalization, text: v } }), true)}
          <Field label="Punti elenco"><div><ListEditor label="Punto" items={s.personalization?.points ?? []} onChange={(points) => setS({ personalization: { title: '', text: '', ...s.personalization, points } })} /></div></Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Sezione processo" />
        <div className="space-y-4 p-5">
          {text('Titolo', s.process?.title, (v) => setS({ process: { steps, title: v } }))}
          {steps.map((st, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-ink-200 p-3 sm:grid-cols-[1fr_2fr_auto]">
              <Input value={st.title} onChange={(e) => setS({ process: { title: s.process?.title ?? '', steps: steps.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) } })} aria-label={`Titolo passo ${i + 1}`} placeholder="Titolo" />
              <Input value={st.text} onChange={(e) => setS({ process: { title: s.process?.title ?? '', steps: steps.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) } })} aria-label={`Testo passo ${i + 1}`} placeholder="Testo" />
              <button type="button" onClick={() => setS({ process: { title: s.process?.title ?? '', steps: steps.filter((_, j) => j !== i) } })} className="rounded-lg p-2 text-ink-400 hover:text-danger-600" aria-label="Rimuovi passo"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setS({ process: { title: s.process?.title ?? '', steps: [...steps, { title: '', text: '' }] } })}>Aggiungi passo</Button>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {([['portfolio', 'Sezione portfolio'], ['catalog_cta', 'Box catalogo'], ['contact_cta', 'Box contatti']] as const).map(([k, label]) => (
          <Card key={k}>
            <CardHeader title={label} />
            <div className="space-y-4 p-5">
              {text('Titolo', s[k]?.title, (v) => setS({ [k]: { text: s[k]?.text ?? '', title: v } }))}
              {text('Testo', s[k]?.text, (v) => setS({ [k]: { title: s[k]?.title ?? '', text: v } }), true)}
            </div>
          </Card>
        ))}
      </div>
      <div className="flex justify-end"><Button loading={saving} onClick={() => void save()}>Salva e pubblica</Button></div>
    </div>
  )
}
