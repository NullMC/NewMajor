// Aree di stampa del cliente: nelle zone previste dal prodotto (tutto il davanti, il dietro, le
// maniche) il cliente aggiunge grafiche o testi. La disposizione può essere libera oppure dividere
// lo spazio in parti uguali (affiancate, una sotto l'altra, a griglia): ogni grafica occupa la sua
// parte con le sue proporzioni. Per ogni area: tecnica, misure in cm, posizione (anche rapida: lato
// cuore, centro petto, lato opposto), centratura e rotazione. Il prezzo dipende dalla tecnica e
// dalla superficie occupata.

import { useState } from 'react'
import {
  AlertTriangle, AlignCenterHorizontal, AlignCenterVertical, Columns3, Grid2x2, Hand, Heart, Image as ImageIcon,
  Library, Link2, Link2Off, Move, Replace, RotateCcw, RotateCw, Rows3, Trash2, Type,
} from 'lucide-react'
import type { CustomizationAsset } from '@/types/db'
import type { PlacedElement, PrintZone, TechniqueCode, ZoneLayout } from '@/types/config'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/format'
import { errorMessage } from '@/lib/errors'
import { ACCEPTED_GRAPHIC_TYPES } from '@/lib/imageQuality'
import { publicUrl } from '@/lib/storage'
import { elementDpi, ZONE_LABEL } from '@/lib/patterns/placement'
import { elementIssues, elementLabel, elementPrice, findZone, heightOf, TECHNIQUE_LABEL, type QuickSpot } from '@/lib/printing'
import { Button } from '@/components/ui/Button'
import { Checkbox, Input, Select } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Overlay'
import { useSettings } from '@/features/settings/SettingsProvider'
import type { ConfiguratorApi } from '../useConfigurator'
import { QualityBadge, Thumb } from './GraphicsSection'

const num = (v: string) => Number(v.replace(',', '.'))
const fmt = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',')

const LAYOUTS: { value: ZoneLayout; label: string; icon: typeof Hand; hint: string }[] = [
  { value: 'free', label: 'Libera', icon: Hand, hint: 'Posizioni e misure scelte da te.' },
  { value: 'columns', label: 'Affiancate', icon: Columns3, hint: 'Lo spazio è diviso in parti uguali, una accanto all’altra.' },
  { value: 'rows', label: 'In colonna', icon: Rows3, hint: 'Lo spazio è diviso in parti uguali, una sotto l’altra.' },
  { value: 'grid', label: 'Griglia', icon: Grid2x2, hint: 'Lo spazio è diviso in parti uguali a griglia (4 grafiche = 4 quarti).' },
]

const SPOTS: { value: QuickSpot; label: string }[] = [
  { value: 'heart', label: 'Lato cuore' },
  { value: 'chest', label: 'Centro petto' },
  { value: 'opposite', label: 'Lato opposto' },
]

const ISSUE: Record<string, string> = {
  outside: 'Esce dall’area di stampa: spostala o riducila.',
  overlap: 'Si sovrappone a un’altra area.',
  overlap_fixed: 'Si sovrappone a un logo, sponsor, nome o numero già scelto: spostala.',
  technique: 'Tecnica non disponibile in questa zona.',
  category: 'Questo contenuto non è ammesso in questa zona.',
  too_many: 'Troppe aree in questa zona.',
  empty_text: 'Scrivi il testo.',
  no_zone: 'Questa zona non prevede aree di stampa.',
}

function NumberField({ label, value, onChange, step = 0.5, suffix }: { label: string; value: number; onChange: (v: number) => void; step?: number; suffix?: string }) {
  return (
    <label className="text-xs font-medium text-ink-600">{label}{suffix ? <span className="text-ink-400"> ({suffix})</span> : null}
      <Input type="number" inputMode="decimal" step={step} value={Math.round(value * 10) / 10} onChange={(e) => { const v = num(e.target.value); if (Number.isFinite(v)) onChange(v) }} className="mt-1 h-9 font-mono text-sm" />
    </label>
  )
}

function AreaCard({ api, el, index }: { api: ConfiguratorApi; el: PlacedElement; index: number }) {
  const { settings } = useSettings()
  const [error, setError] = useState<string | null>(null)
  const zone = findZone(api.product.print_zones ?? [], el.zone, el.kitItemId)
  const techs = zone ? api.techniquesFor(zone) : []
  const tech = api.techniques.find((t) => t.code === el.technique)
  const price = zone && tech ? elementPrice(el, zone, tech) : 0
  const issues = elementIssues(el, api.elements, api.product.print_zones ?? [], api.techniques, techs.some((t) => t.all_over_only), api.blockedFor(el.zone, el.kitItemId ?? null))
  const q = api.elementQuality(el)
  const dpi = elementDpi(el)
  const selected = api.selectedElement === el.id
  const isText = el.kind === 'text'
  const locked = !isText && el.lockRatio !== false
  const up = (p: Partial<PlacedElement>) => api.updateElement(el.id, p)

  const replace = async (f: File) => {
    setError(null)
    try {
      const r = await api.replaceElementAsset(el.id, f)
      if (r.error) setError(r.error)
      else if (r.report?.blocking) setError(r.report.messages.find((m) => m.level === 'error')?.text ?? 'File non valido.')
    } catch (e) { setError(errorMessage(e)) }
  }

  return (
    <li className={cn('rounded-2xl border bg-white p-4 transition-colors', selected ? 'border-gold-500' : 'border-ink-200')}>
      <div className="flex items-start gap-3">
        {isText ? (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl text-sm font-black uppercase ring-1 ring-ink-200" style={{ background: api.baseColor, color: el.color }}>Aa</span>
        ) : el.asset ? <Thumb asset={el.asset} /> : null}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink-900">{elementLabel(el, index)}</p>
          <p className="text-xs text-ink-500">{ZONE_LABEL[el.zone]} · {fmt(el.widthCm)} × {fmt(heightOf(el))} cm{el.rotation ? ` · ${el.rotation}°` : ''}{dpi ? ` · ≈ ${dpi} dpi` : ''}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {!isText && <QualityBadge q={q} />}
            {price > 0 && <span className="text-sm font-semibold text-ink-800">+{formatPrice(price)}</span>}
          </div>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant={selected ? 'primary' : 'secondary'} icon={<Move className="h-4 w-4" />} onClick={() => api.setSelectedElement(selected ? null : el.id)} aria-pressed={selected}>
            {selected ? 'Fatto' : 'Posiziona'}
          </Button>
          <button type="button" onClick={() => api.removeElement(el.id)} className="rounded-lg p-2 text-ink-400 hover:bg-danger-50 hover:text-danger-600" aria-label={`Rimuovi ${elementLabel(el, index)}`}><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>

      {isText && (
        <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_5rem]">
          <label className="text-xs font-medium text-ink-600">Testo
            <Input value={el.text ?? ''} maxLength={40} onChange={(e) => up({ text: e.target.value })} className="mt-1 h-9 text-sm" />
          </label>
          <label className="text-xs font-medium text-ink-600">Carattere
            <Select value={el.font ?? 'block'} onChange={(e) => up({ font: e.target.value as 'block' | 'classic' })} className="mt-1 h-9 text-sm">
              <option value="block">Sportivo</option>
              <option value="classic">Classico</option>
            </Select>
          </label>
          <label className="text-xs font-medium text-ink-600">Colore
            <input type="color" value={el.color ?? '#FFFFFF'} onChange={(e) => up({ color: e.target.value.toUpperCase() })} className="mt-1 h-9 w-full cursor-pointer rounded-lg border border-ink-200 bg-white p-1" />
          </label>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="col-span-2 text-xs font-medium text-ink-600">Tecnica di stampa
          <Select value={el.technique ?? ''} onChange={(e) => up({ technique: e.target.value as TechniqueCode })} className="mt-1 h-9 text-sm">
            {techs.map((t) => <option key={t.code} value={t.code}>{TECHNIQUE_LABEL[t.code]}</option>)}
          </Select>
        </label>
        <NumberField label="Larghezza" suffix="cm" value={el.widthCm} onChange={(v) => up({ widthCm: v })} />
        <NumberField label="Altezza" suffix="cm" value={heightOf(el)} onChange={(v) => up({ heightCm: v })} />
        <NumberField label="Orizzontale" suffix="cm" value={el.xCm} onChange={(v) => up({ xCm: v })} />
        <NumberField label={el.zone.startsWith('sleeve') ? 'Dalla spalla' : 'Sotto il collo'} suffix="cm" value={el.yCm} onChange={(v) => up({ yCm: v })} />
        <NumberField label="Rotazione" suffix="°" step={5} value={el.rotation} onChange={(v) => up({ rotation: ((Math.round(v) + 540) % 360) - 180 })} />
        <div className="flex items-end gap-1">
          {!isText && (
            <button type="button" onClick={() => up({ lockRatio: !locked })} aria-pressed={locked} title={locked ? 'Proporzioni bloccate' : 'Proporzioni libere'}
              className={cn('flex h-9 w-9 items-center justify-center rounded-lg ring-1', locked ? 'bg-ink-900 text-white ring-ink-900' : 'text-ink-600 ring-ink-200 hover:ring-ink-400')}>
              {locked ? <Link2 className="h-4 w-4" /> : <Link2Off className="h-4 w-4" />}<span className="sr-only">Blocca proporzioni</span>
            </button>
          )}
          <button type="button" onClick={() => up({ rotation: ((el.rotation - 90 + 540) % 360) - 180 })} className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-600 ring-1 ring-ink-200 hover:ring-ink-400" title="Ruota di 90° a sinistra"><RotateCcw className="h-4 w-4" /><span className="sr-only">Ruota a sinistra</span></button>
          <button type="button" onClick={() => up({ rotation: ((el.rotation + 90 + 540) % 360) - 180 })} className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-600 ring-1 ring-ink-200 hover:ring-ink-400" title="Ruota di 90° a destra"><RotateCw className="h-4 w-4" /><span className="sr-only">Ruota a destra</span></button>
        </div>
      </div>

      {el.zone === 'front' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-600"><Heart className="h-3.5 w-3.5" aria-hidden /> Posizione rapida</span>
          {SPOTS.map((s) => <Button key={s.value} size="sm" variant="ghost" onClick={() => api.placeElement(el.id, s.value)}>{s.label}</Button>)}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={<AlignCenterVertical className="h-4 w-4" />} onClick={() => api.centerElement(el.id, 'x')}>Centra in orizzontale</Button>
        <Button size="sm" variant="secondary" icon={<AlignCenterHorizontal className="h-4 w-4" />} onClick={() => api.centerElement(el.id, 'y')}>Centra in verticale</Button>
        {!isText && (
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-ink-200 px-3 text-sm font-semibold hover:border-ink-400">
            <Replace className="h-4 w-4" /> Sostituisci grafica
            <input type="file" accept={ACCEPTED_GRAPHIC_TYPES.join(',')} className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void replace(f); e.target.value = '' }} />
          </label>
        )}
      </div>

      {issues.map((i) => (
        <p key={i} className="mt-3 flex gap-2 rounded-xl bg-danger-50 p-3 text-sm text-danger-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{ISSUE[i]}</p>
      ))}
      {!isText && el.asset && (q === 'warn' || q === 'poor') && (
        <div className={cn('mt-3 rounded-xl p-3 text-sm', q === 'poor' ? 'bg-danger-50 text-danger-700' : 'bg-warning-50 text-warning-700')}>
          <p className="flex gap-2 font-medium">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {q === 'poor' ? `Risoluzione insufficiente a questa dimensione (≈ ${dpi} dpi): la stampa risulterà sgranata.` : `Risoluzione sotto i ${settings.quality.min_dpi} dpi consigliati (≈ ${dpi} dpi).`}
          </p>
          <Checkbox className="mt-3 pl-6" label="Ho capito e voglio procedere con questa grafica" checked={!!el.asset.acknowledgedLowQuality}
            onChange={(e) => up({ asset: { ...el.asset!, acknowledgedLowQuality: e.target.checked } })} />
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm font-medium text-danger-600">{error}</p>}
    </li>
  )
}

export function PrintAreasSection({ api, library }: { api: ConfiguratorApi; library: CustomizationAsset[] }) {
  const zones = api.printZones
  const [zoneKey, setZoneKey] = useState<PrintZone>(zones[0]?.zone ?? 'front')
  const [libOpen, setLibOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const zone = zones.find((z) => z.zone === zoneKey) ?? zones[0]
  if (!zone) return null
  const libItems = library.filter((a) => a.kind !== 'pattern')
  const inZone = api.elements.filter((e) => e.technique && e.zone === zone.zone && (e.kitItemId ?? null) === api.elementKit)
  const list = api.elements.filter((e) => (e.kitItemId ?? null) === api.elementKit)
  const full = inZone.length >= zone.max_items
  const techs = api.techniquesFor(zone)

  const add = async (kind: 'graphic' | 'text', source?: Parameters<ConfiguratorApi['addElement']>[3]) => {
    setError(null)
    try {
      const r = await api.addElement(kind, zone.zone, 'x', source)
      if (r.error) setError(r.error)
      else if (r.report?.blocking) setError(r.report.messages.find((m) => m.level === 'error')?.text ?? 'File non valido.')
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const seg = (on: boolean) => cn('inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors', on ? 'bg-ink-900 text-white' : 'text-ink-600 hover:text-ink-900')
  const layout = api.layoutOf(zone.zone, api.elementKit)
  const usable = api.usableFor(zone.zone, api.elementKit)

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-ink-200 bg-ink-50 p-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Zona di stampa">
          {zones.map((z) => (
            <button key={z.id} type="button" onClick={() => setZoneKey(z.zone)} aria-pressed={z.zone === zone.zone}
              className={cn('h-10 rounded-full px-4 text-sm font-semibold transition-colors', z.zone === zone.zone ? 'bg-ink-900 text-white' : 'bg-white text-ink-700 ring-1 ring-ink-200 hover:ring-ink-400')}>
              {ZONE_LABEL[z.zone]}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-ink-600">
          Area di stampa {fmt(Number(zone.width_cm))} × {fmt(Number(zone.height_cm))} cm
          {usable && (usable.x2 - usable.x1 < Number(zone.width_cm) - 0.05 || usable.y2 - usable.y1 < Number(zone.height_cm) - 0.05) && <> (libero {fmt(usable.x2 - usable.x1)} × {fmt(usable.y2 - usable.y1)} cm accanto a nome, numero o loghi scelti)</>}
          {' · '}fino a {zone.max_items} {zone.max_items === 1 ? 'area' : 'aree'}
          {' · '}{[zone.allow_graphic && 'grafiche', zone.allow_text && 'testi'].filter(Boolean).join(' e ')}
          {techs.length > 0 && <> · {techs.map((t) => `${TECHNIQUE_LABEL[t.code]}${Number(t.max_price) > 0 ? ` ${formatPrice(t.min_price)}–${formatPrice(t.max_price)}` : ''}`).join(', ')}</>}
        </p>
        <div className="mt-3">
          <p className="text-xs font-medium text-ink-600">Disposizione</p>
          <div className="mt-1.5 inline-flex flex-wrap rounded-xl bg-white p-0.5 ring-1 ring-ink-200" role="group" aria-label="Disposizione delle aree">
            {LAYOUTS.map((l) => (
              <button key={l.value} type="button" className={seg(layout === l.value)} aria-pressed={layout === l.value} title={l.hint} onClick={() => api.setLayout(zone.zone, l.value)}>
                <l.icon className="h-4 w-4" aria-hidden /> {l.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-ink-500">{LAYOUTS.find((l) => l.value === layout)?.hint}{layout !== 'free' ? ' Ogni grafica mantiene le sue proporzioni; se sposti o ridimensioni un’area la disposizione torna libera.' : ''}</p>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {zone.allow_graphic && (
            <>
              <label className={cn('inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-ink-900 px-4 text-sm font-semibold text-white transition hover:bg-ink-800', (full || api.elementUploading) && 'pointer-events-none opacity-50')}>
                <ImageIcon className="h-4 w-4" aria-hidden /> {api.elementUploading ? 'Caricamento…' : 'Aggiungi grafica'}
                <input type="file" accept={ACCEPTED_GRAPHIC_TYPES.join(',')} className="sr-only" disabled={full} onChange={(e) => { const f = e.target.files?.[0]; if (f) void add('graphic', { file: f }); e.target.value = '' }} />
              </label>
              {libItems.length > 0 && <Button size="sm" variant="secondary" disabled={full} icon={<Library className="h-4 w-4" />} onClick={() => setLibOpen(true)}>Dalla libreria</Button>}
            </>
          )}
          {zone.allow_text && <Button size="sm" variant="secondary" disabled={full} icon={<Type className="h-4 w-4" />} onClick={() => void add('text')}>Aggiungi testo</Button>}
        </div>
        {full && <p className="mt-2 text-xs text-ink-500">Hai raggiunto il numero massimo di aree per questa zona.</p>}
      </div>
      {error && <p role="alert" className="text-sm font-medium text-danger-600">{error}</p>}
      {list.length > 0 && <ul className="space-y-3">{list.map((el, i) => <AreaCard key={el.id} api={api} el={el} index={i} />)}</ul>}

      <Modal open={libOpen} onClose={() => setLibOpen(false)} title="Libreria grafiche" size="lg">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {libItems.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => { setLibOpen(false); void add('graphic', { library: a }) }} className="w-full rounded-xl border border-ink-200 p-2 text-left hover:border-ink-900">
                <div className="checker flex aspect-square items-center justify-center overflow-hidden rounded-lg">
                  <img src={publicUrl(a.storage_path) ?? ''} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
                </div>
                <p className="mt-2 truncate text-xs font-medium">{a.name}</p>
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  )
}
