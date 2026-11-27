// Aree di stampa del prodotto (configuratore personale dell'admin): per ogni componente e zona
// (davanti, dietro, maniche) si definisce l'area massima di stampa in cm, posizionata sul pezzo
// del cartamodello o, in mancanza, sulla sagoma; il numero massimo di aree che il cliente può
// inserire, le categorie (grafica, testo) e le tecniche ammesse. Qui si attivano anche le fasce
// e la grafica all-over.

import { useMemo, useRef, useState, type PointerEvent } from 'react'
import { Save, Trash2 } from 'lucide-react'
import type { ModelShape, PrintZoneRow, ProductDetail } from '@/types/db'
import type { PrintZone, TechniqueCode } from '@/types/config'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { bounds, outlinePath, round } from '@/lib/patterns/geometry'
import { anchorOf, ZONE_LABEL, zonePiece, type ZonePiece } from '@/lib/patterns/placement'
import { TECHNIQUE_LABEL } from '@/lib/printing'
import { useQuery } from '@/hooks/useQuery'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Display'
import { Checkbox, Field, FormError, Input, Switch } from '@/components/ui/Form'
import { useUi } from '@/components/ui/Toast'
import { getPrintZones } from '@/features/catalog/api'
import { virtualPiece } from '@/features/configurator/garment/elements'
import { AllOverSettings } from './patterns/FreeElementsSettings'

const ZONES: PrintZone[] = ['front', 'back', 'sleeve_left', 'sleeve_right']
const TECHS: TechniqueCode[] = ['screen', 'dtf', 'embroidery', 'sublimation']
const n = (s: string) => Number(s.replace(',', '.'))

type Draft = Pick<PrintZoneRow, 'x_cm' | 'y_cm' | 'width_cm' | 'height_cm' | 'max_items' | 'allow_graphic' | 'allow_text' | 'techniques'>

const DEFAULTS: Record<PrintZone, Draft> = {
  front: { x_cm: -15, y_cm: 6, width_cm: 30, height_cm: 30, max_items: 3, allow_graphic: true, allow_text: true, techniques: ['screen', 'dtf', 'embroidery'] },
  back: { x_cm: -15, y_cm: 4, width_cm: 30, height_cm: 40, max_items: 3, allow_graphic: true, allow_text: true, techniques: ['screen', 'dtf', 'embroidery'] },
  sleeve_left: { x_cm: -5, y_cm: 4, width_cm: 10, height_cm: 10, max_items: 1, allow_graphic: true, allow_text: true, techniques: ['screen', 'dtf', 'embroidery'] },
  sleeve_right: { x_cm: -5, y_cm: 4, width_cm: 10, height_cm: 10, max_items: 1, allow_graphic: true, allow_text: true, techniques: ['screen', 'dtf', 'embroidery'] },
}

/** Pezzo con il rettangolo dell'area massima, trascinabile (spostamento) e ridimensionabile (angolo). */
function ZoneCanvas({ piece, draft, onChange }: { piece: ZonePiece; draft: Draft; onChange: (d: Partial<Draft>) => void }) {
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<{ mode: 'move' | 'resize'; x: number; y: number; d: Draft } | null>(null)
  const b = bounds(piece.outline)
  const pad = Math.max(b.width, b.height) * 0.06
  const [ax, ay] = anchorOf(piece)
  const toSvg = (x: number, y: number) => [x - b.minX, b.maxY - y] as const
  const pointer = (e: { clientX: number; clientY: number }) => {
    const p = svg.current!.createSVGPoint()
    p.x = e.clientX
    p.y = e.clientY
    const q = p.matrixTransform(svg.current!.getScreenCTM()!.inverse())
    return { x: q.x + b.minX, y: b.maxY - q.y }
  }
  const down = (e: PointerEvent, mode: 'move' | 'resize') => {
    e.stopPropagation()
    const p = pointer(e)
    drag.current = { mode, x: p.x, y: p.y, d: draft }
    svg.current?.setPointerCapture(e.pointerId)
  }
  const move = (e: PointerEvent) => {
    const g = drag.current
    if (!g) return
    const p = pointer(e)
    const dx = (p.x - g.x) / 10, dy = -(p.y - g.y) / 10 // cm, y verso il basso
    if (g.mode === 'move') {
      let x = round(Number(g.d.x_cm) + dx, 1)
      const w = Number(g.d.width_cm)
      if (Math.abs(x + w / 2) < 0.6) x = round(-w / 2, 1) // scatto sull'asse centrale
      onChange({ x_cm: x, y_cm: round(Number(g.d.y_cm) + dy, 1) })
    } else {
      onChange({ width_cm: Math.max(1, round(Number(g.d.width_cm) + dx, 1)), height_cm: Math.max(1, round(Number(g.d.height_cm) + dy, 1)) })
    }
  }
  const [sax, say] = toSvg(ax, ay)
  const [zx, zy] = toSvg(ax + Number(draft.x_cm) * 10, ay - Number(draft.y_cm) * 10)
  const zw = Number(draft.width_cm) * 10, zh = Number(draft.height_cm) * 10
  const handle = Math.max(b.width, b.height) * 0.025
  return (
    <svg ref={svg} viewBox={`${-pad} ${-pad} ${b.width + pad * 2} ${b.height + pad * 2}`} className="h-[26rem] w-full touch-none select-none rounded-xl bg-ink-50"
      onPointerMove={move} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
      <path d={outlinePath(piece.outline, b)} className="fill-white stroke-ink-900/50" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <line x1={sax} y1={-pad} x2={sax} y2={b.height + pad} className="stroke-ink-900/20" strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
      <circle cx={sax} cy={say} r={handle * 0.45} className="fill-gold-500" />
      <rect x={zx} y={zy} width={zw} height={zh} className="cursor-move fill-gold-500/15 stroke-gold-600" strokeWidth={2} strokeDasharray="8 6" vectorEffect="non-scaling-stroke" onPointerDown={(e) => down(e, 'move')} />
      <rect x={zx + zw - handle / 2} y={zy + zh - handle / 2} width={handle} height={handle} className="cursor-nwse-resize fill-white stroke-ink-900" strokeWidth={1.5} vectorEffect="non-scaling-stroke" onPointerDown={(e) => down(e, 'resize')} />
    </svg>
  )
}

function ZoneEditor({ product, kitItemId, zone, row, piece, onSaved }: {
  product: ProductDetail; kitItemId: string | null; zone: PrintZone; row: PrintZoneRow | null; piece: ZonePiece; onSaved: () => void
}) {
  const { toast, confirm } = useUi()
  const [d, setD] = useState<Draft>(() => row ? { ...row, techniques: [...row.techniques] } : { ...DEFAULTS[zone] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }))
  const allOverOk = !!product.all_over_enabled

  const save = async () => {
    if (!(Number(d.width_cm) > 0 && Number(d.height_cm) > 0)) return setError('Larghezza e altezza devono essere maggiori di zero.')
    if (!d.allow_graphic && !d.allow_text) return setError('Consenti almeno grafiche o testi.')
    if (!d.techniques.length) return setError('Scegli almeno una tecnica.')
    setSaving(true)
    setError(null)
    try {
      const payload = { ...d, product_id: product.id, kit_item_id: kitItemId, zone, sort_order: ZONES.indexOf(zone) }
      const { error: e } = row
        ? await supabase.from('print_zones').update(payload).eq('id', row.id)
        : await supabase.from('print_zones').insert(payload)
      if (e) throw e
      toast('Area di stampa salvata')
      onSaved()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }
  const remove = async () => {
    if (!row || !(await confirm({ title: `Disattivare ${ZONE_LABEL[zone].toLowerCase()}?`, message: 'Il cliente non potrà più inserire aree di stampa in questa zona.', confirmLabel: 'Disattiva', danger: true }))) return
    const { error: e } = await supabase.from('print_zones').delete().eq('id', row.id)
    if (e) toast(errorMessage(e), 'error')
    else onSaved()
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <ZoneCanvas piece={piece} draft={d} onChange={set} />
        <p className="mt-2 text-xs text-ink-500">
          {piece.virtual ? 'Nessun cartamodello per questo componente: posizione indicativa sulla sagoma (misure reali in cm). ' : `Pezzo del cartamodello, taglia ${piece.size}. `}
          Il punto oro è il riferimento (centro collo o sommità della manica). Trascina il riquadro per spostarlo, l’angolo per ridimensionarlo.
        </p>
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Orizzontale (cm)" hint="Lato sinistro dal centro"><Input inputMode="decimal" value={d.x_cm} onChange={(e) => set({ x_cm: n(e.target.value) })} /></Field>
          <Field label="Dal riferimento (cm)" hint="Lato superiore, verso il basso"><Input inputMode="decimal" value={d.y_cm} onChange={(e) => set({ y_cm: n(e.target.value) })} /></Field>
          <Field label="Larghezza (cm)"><Input inputMode="decimal" value={d.width_cm} onChange={(e) => set({ width_cm: n(e.target.value) })} /></Field>
          <Field label="Altezza (cm)"><Input inputMode="decimal" value={d.height_cm} onChange={(e) => set({ height_cm: n(e.target.value) })} /></Field>
          <Field label="Aree al massimo"><Input inputMode="numeric" value={d.max_items} onChange={(e) => set({ max_items: Math.max(1, Math.min(20, Math.round(n(e.target.value)) || 1)) })} /></Field>
          <div className="flex items-end pb-1"><Button size="sm" variant="secondary" onClick={() => set({ x_cm: round(-Number(d.width_cm) / 2, 1) })}>Centra in orizzontale</Button></div>
        </div>
        <fieldset>
          <legend className="text-sm font-medium text-ink-800">Contenuti ammessi</legend>
          <div className="mt-2 flex gap-5">
            <Checkbox label="Grafiche" checked={d.allow_graphic} onChange={(e) => set({ allow_graphic: e.target.checked })} />
            <Checkbox label="Testi" checked={d.allow_text} onChange={(e) => set({ allow_text: e.target.checked })} />
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-sm font-medium text-ink-800">Tecniche di stampa</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {TECHS.map((t) => {
              const on = d.techniques.includes(t)
              return (
                <label key={t} className={cn('inline-flex cursor-pointer items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium ring-1', on ? 'bg-ink-900 text-white ring-ink-900' : 'ring-ink-200')}>
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => set({ techniques: on ? d.techniques.filter((x) => x !== t) : [...d.techniques, t] })} />
                  {TECHNIQUE_LABEL[t]}
                </label>
              )
            })}
          </div>
          {d.techniques.includes('sublimation') && !allOverOk && <p className="mt-2 text-xs text-warning-700">La sublimazione è proposta al cliente solo se il prodotto ha la grafica all-over attiva.</p>}
        </fieldset>
        <FormError message={error} />
        <div className="flex flex-wrap justify-end gap-2">
          {row && <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => void remove()}>Disattiva zona</Button>}
          <Button loading={saving} icon={<Save className="h-4 w-4" />} onClick={() => void save()}>{row ? 'Salva' : 'Attiva zona'}</Button>
        </div>
      </div>
    </div>
  )
}

/** Fasce su maniche o fondo gamba, per il prodotto o per un componente del kit. */
function BandSettings({ product, kitItemId, onSaved }: { product: ProductDetail; kitItemId: string | null; onSaved: () => void }) {
  const { toast } = useUi()
  const src = kitItemId ? product.kit_items.find((k) => k.id === kitItemId) : product
  const [enabled, setEnabled] = useState(!!src?.band_enabled)
  const [height, setHeight] = useState(String(src?.band_height_cm ?? 4))
  const [price, setPrice] = useState(String(src?.band_price ?? 0))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    const h = n(height), p = n(price)
    if (!(h > 0 && h <= 30)) return setError('Altezza della fascia tra 0 e 30 cm.')
    if (!(p >= 0)) return setError('Il prezzo deve essere maggiore o uguale a 0.')
    setSaving(true)
    setError(null)
    try {
      const patch = { band_enabled: enabled, band_height_cm: h, band_price: p }
      const { error: e } = kitItemId
        ? await supabase.from('kit_items').update(patch).eq('id', kitItemId)
        : await supabase.from('products').update(patch).eq('id', product.id)
      if (e) throw e
      toast('Impostazioni salvate')
      onSaved()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Card>
      <CardHeader title="Fasce" description="Fascia sul fondo delle maniche (capi superiori) o delle gambe (pantaloncini e pantaloni): il cliente sceglie un colore diverso o una grafica stampata." />
      <div className="grid gap-4 p-5 sm:grid-cols-3">
        <div className="flex items-center gap-3"><Switch checked={enabled} onChange={setEnabled} label="Consenti le fasce" /><span className="text-sm font-medium">Consenti le fasce</span></div>
        <Field label="Altezza (cm)"><Input inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} /></Field>
        <Field label="Prezzo (€ per capo)"><Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
        <div className="sm:col-span-3"><FormError message={error} /></div>
        <div className="flex justify-end sm:col-span-3"><Button loading={saving} onClick={() => void save()}>Salva</Button></div>
      </div>
    </Card>
  )
}

export function PrintZonesTab({ product, onChanged }: { product: ProductDetail; onChanged: () => void }) {
  const targets = useMemo(() => (
    product.product_type === 'kit' && product.kit_items.length
      ? product.kit_items.map((k) => ({ kitItemId: k.id as string | null, label: k.label, shape: (k.model_shape ?? product.model_shape) as ModelShape }))
      : [{ kitItemId: null as string | null, label: product.name, shape: product.model_shape }]
  ), [product])
  const [ti, setTi] = useState(0)
  const [zone, setZone] = useState<PrintZone>('front')
  const target = targets[Math.min(ti, targets.length - 1)]
  const { data: pieces } = useQuery(`print-zones:${product.id}`, () => getPrintZones(product.id))
  const row = (product.print_zones ?? []).find((z) => z.zone === zone && (z.kit_item_id ?? null) === target.kitItemId) ?? null
  const piece = zonePiece(pieces ?? [], zone, target.kitItemId) ?? virtualPiece(target.shape, zone, target.kitItemId)
  const active = (z: PrintZone) => (product.print_zones ?? []).some((r) => r.zone === z && (r.kit_item_id ?? null) === target.kitItemId)

  return (
    <div className="space-y-6">
      <Card className="p-5 text-sm leading-6 text-ink-600">
        <p>
          Per ogni zona definisci l’<strong>area massima di stampa</strong> in centimetri: il cliente vi inserisce grafiche o testi (fino al numero indicato),
          accanto o uno sotto l’altro, e sceglie la tecnica. Il prezzo di ogni area va dal minimo al massimo della tecnica in proporzione alla superficie
          occupata rispetto all’area massima (Impostazioni → Tecniche di stampa).
        </p>
        {targets.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Componente del kit">
            {targets.map((t, i) => (
              <button key={t.kitItemId ?? 'main'} type="button" onClick={() => setTi(i)} aria-pressed={i === ti}
                className={cn('rounded-full px-4 py-1.5 text-sm font-semibold ring-1 transition', i === ti ? 'bg-ink-900 text-white ring-ink-900' : 'ring-ink-200 hover:ring-ink-400')}>
                {t.label}
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Aree di stampa" description="Seleziona la zona da attivare o modificare." />
        <div className="space-y-5 p-5">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Zona">
            {ZONES.map((z) => (
              <button key={z} type="button" onClick={() => setZone(z)} aria-pressed={z === zone}
                className={cn('inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold ring-1 transition', z === zone ? 'bg-ink-900 text-white ring-ink-900' : 'ring-ink-200 hover:ring-ink-400')}>
                <span className={cn('h-2 w-2 rounded-full', active(z) ? 'bg-success-600' : 'bg-ink-300')} aria-hidden />
                {ZONE_LABEL[z]}
              </button>
            ))}
          </div>
          <ZoneEditor key={`${target.kitItemId}-${zone}-${row?.id ?? 'new'}`} product={product} kitItemId={target.kitItemId} zone={zone} row={row} piece={piece} onSaved={onChanged} />
        </div>
      </Card>

      <BandSettings key={`band-${target.kitItemId}`} product={product} kitItemId={target.kitItemId} onSaved={onChanged} />
      <AllOverSettings key={`ao-${product.id}`} product={product} onSaved={onChanged} />
    </div>
  )
}
