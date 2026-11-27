// Grafica all-over scelta dal cliente: una grafica su tutto il capo (o sul componente del kit
// visualizzato) e, facoltativamente, una grafica diversa per singoli pezzi.

import { useState } from 'react'
import { AlertTriangle, Info, Library, Palette, Replace, Trash2, Upload } from 'lucide-react'
import type { CustomizationAsset } from '@/types/db'
import type { AssetRef, SectionKey } from '@/types/config'
import { cn } from '@/lib/cn'
import { formatBytes, formatPrice } from '@/lib/format'
import { ACCEPTED_GRAPHIC_TYPES } from '@/lib/imageQuality'
import { publicUrl } from '@/lib/storage'
import { errorMessage } from '@/lib/errors'
import { SECTION_LABEL } from '@/lib/patterns/placement'
import { Dropzone } from '@/components/ui/Dropzone'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Overlay'
import { useSettings } from '@/features/settings/SettingsProvider'
import type { ConfiguratorApi } from '../useConfigurator'
import { QualityBadge, Thumb } from './GraphicsSection'

type Slot = SectionKey | 'main'

function FileInputButton({ label, icon, onFile, disabled }: { label: string; icon: React.ReactNode; onFile: (f: File) => void; disabled?: boolean }) {
  return (
    <label className={cn('inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-ink-200 px-3 text-sm font-semibold hover:border-ink-400', disabled && 'pointer-events-none opacity-50')}>
      {icon} {label}
      <input type="file" accept={ACCEPTED_GRAPHIC_TYPES.join(',')} className="sr-only" disabled={disabled} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
    </label>
  )
}

/** Riepilogo di una grafica caricata con qualità e conferma per le risoluzioni basse. */
function AssetSummary({ api, slot, asset }: { api: ConfiguratorApi; slot: Slot; asset: AssetRef }) {
  const { settings } = useSettings()
  const live = api.allOverQuality(asset, slot)
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Thumb asset={asset} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink-900">{asset.name}</p>
          <p className="text-xs text-ink-500">
            {asset.isVector ? 'Vettoriale' : `${asset.width}×${asset.height} px`}
            {asset.sizeBytes ? ` · ${formatBytes(asset.sizeBytes)}` : ''}
            {live.dpi ? ` · ≈ ${live.dpi} dpi sul pezzo` : ''}
          </p>
          <div className="mt-1.5"><QualityBadge q={live.quality} /></div>
        </div>
      </div>
      {(live.quality === 'warn' || live.quality === 'poor') && (
        <div className={cn('rounded-xl p-3 text-sm', live.quality === 'poor' ? 'bg-danger-50 text-danger-700' : 'bg-warning-50 text-warning-700')}>
          <p className="flex gap-2 font-medium">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {live.quality === 'poor'
              ? `Risoluzione insufficiente (≈ ${live.dpi} dpi): sul capo la stampa risulterà sgranata.`
              : `Risoluzione sotto i ${settings.quality.min_dpi} dpi consigliati (≈ ${live.dpi} dpi).`}
          </p>
          <Checkbox
            className="mt-3 pl-6"
            label="Ho capito e voglio procedere con questa grafica"
            checked={!!asset.acknowledgedLowQuality}
            onChange={(e) => api.setAllOverAsset(slot, { ...asset, quality: live.quality, effectiveDpi: live.dpi, acknowledgedLowQuality: e.target.checked })}
          />
        </div>
      )}
    </div>
  )
}

export function AllOverSection({ api, library }: { api: ConfiguratorApi; library: CustomizationAsset[] }) {
  const [error, setError] = useState<string | null>(null)
  const [libFor, setLibFor] = useState<Slot | null>(null)
  const libItems = library.filter((a) => a.kind === 'pattern' || a.kind === 'graphic')
  const ao = api.allOver
  const price = Number(api.product.all_over_price ?? 0)
  const kitLabel = api.product.product_type === 'kit' ? api.kitItem?.label : null

  const upload = async (slot: Slot, file: File) => {
    setError(null)
    try {
      const r = await api.uploadAllOver(slot, file)
      if (r.blocking) setError(r.messages.find((m) => m.level === 'error')?.text ?? 'File non valido.')
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 rounded-2xl border border-ink-200 bg-white p-4 text-sm text-ink-700">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-ink-500" aria-hidden />
        <div>
          <p>
            Una grafica che copre {kitLabel ? <>l’intero capo <strong>{kitLabel}</strong></> : 'l’intero capo'}: davanti, dietro
            {api.allOverZones.length > 2 ? ' e maniche' : ''}. Loghi, sponsor, nomi e numeri restano stampati sopra.
            {price > 0 && <> Costo: <strong>+{formatPrice(price)}</strong> per capo.</>}
          </p>
          {kitLabel && api.allOverKitCount > 1 && <p className="mt-1 text-ink-500">Per gli altri capi del kit selezionali sopra l’anteprima.</p>}
          {!api.allOverPieces.length && (
            <p className="mt-1 text-ink-500">
              Per questo capo non sono ancora disponibili le misure dei pezzi, quindi non possiamo calcolare la risoluzione di stampa:
              carica il file alla massima risoluzione disponibile o in formato vettoriale (SVG).
            </p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-ink-200 bg-white p-4">
        <p className="font-semibold text-ink-900">Grafica su tutto il capo</p>
        {ao ? (
          <div className="mt-3 space-y-3">
            <AssetSummary api={api} slot="main" asset={ao.asset} />
            <div className="flex flex-wrap gap-2">
              <FileInputButton label="Sostituisci" icon={<Replace className="h-4 w-4" />} disabled={!!api.allOverUploading} onFile={(f) => void upload('main', f)} />
              <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => api.setAllOverAsset('main', null)}>Rimuovi</Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <Dropzone
              compact
              accept={ACCEPTED_GRAPHIC_TYPES.join(',')}
              onFiles={(files) => { if (files[0]) void upload('main', files[0]) }}
              disabled={api.allOverUploading === 'main'}
              label={api.allOverUploading === 'main' ? 'Caricamento e controllo del file…' : 'Carica la grafica all-over'}
              hint="JPG, PNG, WebP o SVG · la grafica viene adattata a ogni pezzo riempiendolo"
            />
            {libItems.length > 0 && (
              <Button variant="secondary" size="sm" icon={<Library className="h-4 w-4" />} onClick={() => setLibFor('main')}>Scegli dalla libreria</Button>
            )}
          </div>
        )}
      </div>

      {ao && (
        <div className="rounded-2xl border border-ink-200 bg-white p-4">
          <p className="font-semibold text-ink-900">Grafica o colore diversi per sezione <span className="font-normal text-ink-500">(facoltativi)</span></p>
          <ul className="mt-3 divide-y divide-ink-100">
            {api.allOverZones.map((zone) => {
              const asset = ao.overrides?.[zone]
              const color = ao.colors?.[zone]
              return (
                <li key={zone} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-ink-900">{SECTION_LABEL[zone]}</p>
                    {color ? (
                      <div className="flex items-center gap-2">
                        <input type="color" value={color} onChange={(e) => api.setAllOverColor(zone, e.target.value.toUpperCase())} aria-label={`Colore ${SECTION_LABEL[zone].toLowerCase()}`} className="h-9 w-14 cursor-pointer rounded-lg border border-ink-200 bg-white p-1" />
                        <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => api.setAllOverColor(zone, null)}>Usa la grafica del capo</Button>
                      </div>
                    ) : asset ? (
                      <div className="flex gap-2">
                        <FileInputButton label="Sostituisci" icon={<Replace className="h-4 w-4" />} disabled={!!api.allOverUploading} onFile={(f) => void upload(zone, f)} />
                        <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => api.setAllOverAsset(zone, null)}>Usa quella del capo</Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <FileInputButton label={api.allOverUploading === zone ? 'Caricamento…' : 'Usa una grafica diversa'} icon={<Upload className="h-4 w-4" />} disabled={!!api.allOverUploading} onFile={(f) => void upload(zone, f)} />
                        {libItems.length > 0 && <Button variant="ghost" size="sm" icon={<Library className="h-4 w-4" />} onClick={() => setLibFor(zone)}>Libreria</Button>}
                        <Button variant="ghost" size="sm" icon={<Palette className="h-4 w-4" />} onClick={() => api.setAllOverColor(zone, api.secondaryColor ?? api.baseColor)}>Colore</Button>
                      </div>
                    )}
                  </div>
                  {asset && <div className="mt-3"><AssetSummary api={api} slot={zone} asset={asset} /></div>}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {error && <p role="alert" className="text-sm font-medium text-danger-600">{error}</p>}

      <Modal open={libFor !== null} onClose={() => setLibFor(null)} title="Libreria grafiche" size="lg">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {libItems.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => { if (libFor) api.pickAllOverLibrary(libFor, a); setLibFor(null) }}
                className="group w-full rounded-xl border border-ink-200 p-2 text-left hover:border-ink-900"
              >
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
