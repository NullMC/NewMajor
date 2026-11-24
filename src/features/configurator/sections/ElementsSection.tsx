// Loghi e sponsor liberi: il cliente ne aggiunge quanti ne consente il prodotto e li posiziona
// su davanti, dietro e maniche. Misure e posizioni sono in centimetri reali.

import { useState } from 'react'
import { AlertTriangle, Library, Move, Plus, Trash2 } from 'lucide-react'
import type { CustomizationAsset } from '@/types/db'
import type { PlacedElement, PrintZone } from '@/types/config'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/format'
import { errorMessage } from '@/lib/errors'
import { ACCEPTED_GRAPHIC_TYPES } from '@/lib/imageQuality'
import { publicUrl } from '@/lib/storage'
import { elementDpi, elementHeightCm, placementIssue, zonePiece, ZONE_LABEL } from '@/lib/patterns/placement'
import { Button } from '@/components/ui/Button'
import { Checkbox, Input, Select } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Overlay'
import { useSettings } from '@/features/settings/SettingsProvider'
import type { ConfiguratorApi } from '../useConfigurator'
import { QualityBadge, Thumb } from './GraphicsSection'

const KIND_LABEL = { logo: 'Logo', sponsor: 'Sponsor' } as const
const num = (v: string) => Number(v.replace(',', '.'))

function ElementCard({ api, el, index }: { api: ConfiguratorApi; el: PlacedElement; index: number }) {
  const { settings } = useSettings()
  const piece = zonePiece(api.zones, el.zone, el.kitItemId ?? null)
  const issue = piece ? placementIssue(el, piece) : null
  const q = api.elementQuality(el)
  const dpi = elementDpi(el)
  const selected = api.selectedElement === el.id
  const maxCmAtMin = el.asset.width ? Math.floor((el.asset.width / settings.quality.min_dpi) * 2.54 * 10) / 10 : null
  return (
    <li className={cn('rounded-2xl border bg-white p-4 transition-colors', selected ? 'border-gold-500' : 'border-ink-200')}>
      <div className="flex items-start gap-3">
        <Thumb asset={el.asset} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink-900">{KIND_LABEL[el.kind]} {index + 1}</p>
          <p className="truncate text-xs text-ink-500">{el.asset.name}{dpi ? ` · ≈ ${dpi} dpi` : ''}</p>
          <div className="mt-1.5"><QualityBadge q={q} /></div>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant={selected ? 'primary' : 'secondary'} icon={<Move className="h-4 w-4" />} onClick={() => api.setSelectedElement(selected ? null : el.id)} aria-pressed={selected}>
            {selected ? 'Fatto' : 'Posiziona'}
          </Button>
          <button type="button" onClick={() => api.removeElement(el.id)} className="rounded-lg p-2 text-ink-400 hover:bg-danger-50 hover:text-danger-600" aria-label={`Rimuovi ${KIND_LABEL[el.kind]} ${index + 1}`}><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="col-span-2 text-xs font-medium text-ink-600 sm:col-span-1">Zona
          <Select value={el.zone} onChange={(e) => api.updateElement(el.id, { zone: e.target.value as PrintZone, xCm: 0, yCm: e.target.value.startsWith('sleeve') ? 6 : el.yCm })} className="mt-1 h-9 text-sm">
            {api.freeZones.map((z) => <option key={z} value={z}>{ZONE_LABEL[z]}</option>)}
          </Select>
        </label>
        <label className="text-xs font-medium text-ink-600">Larghezza (cm)
          <Input type="number" inputMode="decimal" step="0.5" min={api.product.free_min_width_cm} max={api.product.free_max_width_cm} value={el.widthCm} onChange={(e) => api.updateElement(el.id, { widthCm: num(e.target.value) || el.widthCm })} className="mt-1 h-9 font-mono text-sm" />
        </label>
        <label className="text-xs font-medium text-ink-600">Orizzontale (cm)
          <Input type="number" inputMode="decimal" step="0.5" value={el.xCm} onChange={(e) => api.updateElement(el.id, { xCm: num(e.target.value) || 0 })} className="mt-1 h-9 font-mono text-sm" />
        </label>
        <label className="text-xs font-medium text-ink-600">{el.zone.startsWith('sleeve') ? 'Dalla spalla (cm)' : 'Sotto il collo (cm)'}
          <Input type="number" inputMode="decimal" step="0.5" value={el.yCm} onChange={(e) => api.updateElement(el.id, { yCm: num(e.target.value) || 0 })} className="mt-1 h-9 font-mono text-sm" />
        </label>
      </div>
      <p className="mt-2 font-mono text-xs text-ink-500">Stampa {String(el.widthCm).replace('.', ',')} × {String(Math.round(elementHeightCm(el) * 10) / 10).replace('.', ',')} cm{el.rotation ? ` · ruotato di ${el.rotation}°` : ''}</p>

      {issue && (
        <p className={cn('mt-3 flex gap-2 rounded-xl p-3 text-sm', issue === 'outside' ? 'bg-danger-50 text-danger-700' : 'bg-warning-50 text-warning-700')}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {issue === 'outside' ? 'L’elemento esce dal pezzo: la parte esterna verrebbe tagliata. Spostalo o riducilo.' : 'L’elemento è vicino alla cucitura (meno di 1,5 cm): potrebbe risultare parzialmente nascosto.'}
        </p>
      )}
      {(q === 'warn' || q === 'poor') && (
        <div className={cn('mt-3 rounded-xl p-3 text-sm', q === 'poor' ? 'bg-danger-50 text-danger-700' : 'bg-warning-50 text-warning-700')}>
          <p className="flex gap-2 font-medium">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {q === 'poor' ? `Risoluzione insufficiente a questa larghezza (≈ ${dpi} dpi): la stampa risulterà sgranata.` : `Risoluzione sotto i ${settings.quality.min_dpi} dpi consigliati (≈ ${dpi} dpi).`}
          </p>
          {maxCmAtMin != null && <p className="mt-1 pl-6 text-xs">Con questo file la larghezza massima a {settings.quality.min_dpi} dpi è {String(maxCmAtMin).replace('.', ',')} cm, oppure usa un file vettoriale (SVG).</p>}
          <Checkbox className="mt-3 pl-6" label="Ho capito e voglio procedere con questa grafica" checked={!!el.asset.acknowledgedLowQuality}
            onChange={(e) => api.updateElement(el.id, { asset: { ...el.asset, acknowledgedLowQuality: e.target.checked } })} />
        </div>
      )}
    </li>
  )
}

export function ElementsSection({ api, library }: { api: ConfiguratorApi; library: CustomizationAsset[] }) {
  const [zone, setZone] = useState<PrintZone>(api.freeZones[0] ?? 'front')
  const [libFor, setLibFor] = useState<PlacedElement['kind'] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { product } = api
  const list = api.elements.filter((e) => (e.kitItemId ?? null) === api.elementKit)
  const full = api.elements.length >= api.freeMax
  const libItems = library.filter((a) => a.kind !== 'pattern')

  const add = async (kind: PlacedElement['kind'], source: Parameters<ConfiguratorApi['addElement']>[2]) => {
    setError(null)
    try {
      const r = await api.addElement(kind, zone, source)
      if (r.error) setError(r.error)
      else if (r.report?.blocking) setError(r.report.messages.find((m) => m.level === 'error')?.text ?? 'File non valido.')
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const addButton = (kind: PlacedElement['kind']) => (
    <div className="flex flex-wrap gap-2">
      <label className={cn('inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-ink-900 px-4 text-sm font-semibold text-white transition hover:bg-ink-800', (full || api.elementUploading) && 'pointer-events-none opacity-50')}>
        <Plus className="h-4 w-4" aria-hidden /> {api.elementUploading ? 'Caricamento…' : `Aggiungi ${kind === 'logo' ? 'logo' : 'sponsor'}`}
        <input type="file" accept={ACCEPTED_GRAPHIC_TYPES.join(',')} className="sr-only" disabled={full} onChange={(e) => { const f = e.target.files?.[0]; if (f) void add(kind, { file: f }); e.target.value = '' }} />
      </label>
      {libItems.length > 0 && <Button size="sm" variant="secondary" disabled={full} icon={<Library className="h-4 w-4" />} onClick={() => setLibFor(kind)}>Dalla libreria</Button>}
    </div>
  )

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600">
        Aggiungi fino a <strong>{api.freeMax}</strong> loghi e sponsor e posizionali dove vuoi su {api.freeZones.map((z) => ZONE_LABEL[z].toLowerCase()).join(', ')}.
        Le misure sono reali e restano uguali su tutte le taglie.
        {Number(product.free_logo_price) > 0 && <> Logo: <strong>+{formatPrice(product.free_logo_price!)}</strong> a capo.</>}
        {Number(product.free_sponsor_price) > 0 && <> Sponsor: <strong>+{formatPrice(product.free_sponsor_price!)}</strong> a capo.</>}
      </p>
      <div className="grid gap-3 rounded-2xl border border-ink-200 bg-ink-50 p-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-end">
        <label className="text-xs font-medium text-ink-600">Dove
          <Select value={zone} onChange={(e) => setZone(e.target.value as PrintZone)} className="mt-1 h-10 text-sm">
            {api.freeZones.map((z) => <option key={z} value={z}>{ZONE_LABEL[z]}</option>)}
          </Select>
        </label>
        <div className="flex flex-wrap gap-x-4 gap-y-2">{addButton('logo')}{addButton('sponsor')}</div>
      </div>
      {full && <p className="text-xs text-ink-500">Hai raggiunto il numero massimo di elementi per questo prodotto.</p>}
      {error && <p role="alert" className="text-sm font-medium text-danger-600">{error}</p>}
      {list.length > 0 && <ul className="space-y-3">{list.map((el, i) => <ElementCard key={el.id} api={api} el={el} index={i} />)}</ul>}

      <Modal open={!!libFor} onClose={() => setLibFor(null)} title="Libreria grafiche" size="lg">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {libItems.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => { const k = libFor!; setLibFor(null); void add(k, { library: a }) }} className="w-full rounded-xl border border-ink-200 p-2 text-left hover:border-ink-900">
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
