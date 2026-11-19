import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, Library, Trash2, Replace } from 'lucide-react'
import type { CustomizationArea, CustomizationAsset } from '@/types/db'
import type { AssetRef } from '@/types/config'
import { cn } from '@/lib/cn'
import { formatBytes, formatPrice } from '@/lib/format'
import { ACCEPTED_GRAPHIC_TYPES, QUALITY_LABEL, type QualityReport } from '@/lib/imageQuality'
import { publicUrl } from '@/lib/storage'
import { errorMessage } from '@/lib/errors'
import { Dropzone } from '@/components/ui/Dropzone'
import { Badge } from '@/components/ui/Display'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Overlay'
import { useSettings } from '@/features/settings/SettingsProvider'
import { assetDisplayUrl } from '@/features/cart/assets'
import { assetQualityFor, type ConfiguratorApi } from '../useConfigurator'

const TYPE_LABEL = { logo: 'Logo', sponsor: 'Sponsor', all_over: 'Grafica all-over', text: 'Testo', number: 'Numero' } as const

function Thumb({ asset }: { asset: AssetRef }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { void assetDisplayUrl(asset).then(setUrl) }, [asset])
  return (
    <div className="checker flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-ink-200">
      {url && <img src={url} alt="" className="max-h-full max-w-full object-contain" />}
    </div>
  )
}

function QualityBadge({ q }: { q: AssetRef['quality'] }) {
  const tone = q === 'poor' ? 'danger' : q === 'warn' ? 'warning' : 'success'
  return <Badge tone={tone}>{QUALITY_LABEL[q]}</Badge>
}

function AreaCard({ api, area, library }: { api: ConfiguratorApi; area: CustomizationArea; library: CustomizationAsset[] }) {
  const { settings } = useSettings()
  const ac = api.config.areas[area.id]
  const asset = ac?.enabled ? ac.asset ?? null : null
  const [report, setReport] = useState<QualityReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [libOpen, setLibOpen] = useState(false)
  const uploading = !!api.uploading[area.id]
  const scale = ac?.scale ?? 1
  const live = asset ? assetQualityFor(asset, area, scale, settings.quality) : null
  const libItems = library.filter((a) =>
    area.area_type === 'all_over' ? a.kind === 'pattern' || a.kind === 'graphic' : a.kind !== 'pattern',
  )
  const minPx = {
    w: Math.ceil((area.print_width_cm / 2.54) * settings.quality.min_dpi),
    h: Math.ceil((area.print_height_cm / 2.54) * settings.quality.min_dpi),
  }

  const onFiles = async (files: File[]) => {
    const f = files[0]
    if (!f) return
    setError(null)
    try {
      const r = await api.uploadGraphic(area, f)
      setReport(r)
      if (r.blocking) setError(r.messages.find((m) => m.level === 'error')?.text ?? 'File non valido.')
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <div
      className={cn('rounded-2xl border bg-white p-4 transition-colors', api.highlightArea === area.id ? 'border-gold-500' : 'border-ink-200')}
      onMouseEnter={() => api.setHighlightArea(area.id)}
      onMouseLeave={() => api.setHighlightArea(null)}
      onFocusCapture={() => { api.setHighlightArea(area.id); api.setView(area.side) }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-ink-900">
            {area.name}
            {area.is_required && <span className="ml-1 text-danger-600" aria-label="obbligatorio">*</span>}
          </p>
          <p className="mt-0.5 text-xs text-ink-500">
            {TYPE_LABEL[area.area_type]} · {area.side === 'front' ? 'Fronte' : 'Retro'} · stampa {area.print_width_cm}×{area.print_height_cm} cm
          </p>
        </div>
        {Number(area.price_delta) > 0 && <span className="text-sm font-semibold text-ink-700">+{formatPrice(area.price_delta)}</span>}
      </div>

      {asset ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-3">
            <Thumb asset={asset} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink-900">{asset.name}</p>
              <p className="text-xs text-ink-500">
                {asset.isVector ? 'Vettoriale' : `${asset.width}×${asset.height} px`}
                {asset.sizeBytes ? ` · ${formatBytes(asset.sizeBytes)}` : ''}
                {live?.dpi ? ` · ≈ ${live.dpi} dpi` : ''}
              </p>
              <div className="mt-1.5">{live && <QualityBadge q={live.quality} />}</div>
            </div>
          </div>

          {(area.area_type === 'logo' || area.area_type === 'sponsor') && (
            <label className="block">
              <span className="flex justify-between text-xs font-medium text-ink-600">
                <span>Dimensione nell’area</span><span>{Math.round(scale * 100)}%</span>
              </span>
              <input
                type="range" min={0.3} max={1} step={0.05} value={scale}
                onChange={(e) => api.setArea(area.id, { scale: Number(e.target.value) })}
                className="mt-1 w-full accent-ink-900"
              />
            </label>
          )}

          {live && (live.quality === 'warn' || live.quality === 'poor') && (
            <div className={cn('rounded-xl p-3 text-sm', live.quality === 'poor' ? 'bg-danger-50 text-danger-700' : 'bg-warning-50 text-warning-700')}>
              <p className="flex gap-2 font-medium">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {live.quality === 'poor'
                  ? `Risoluzione insufficiente (≈ ${live.dpi} dpi): la stampa risulterà sgranata.`
                  : `Risoluzione sotto i ${settings.quality.min_dpi} dpi consigliati (≈ ${live.dpi} dpi).`}
              </p>
              <p className="mt-1 pl-6 text-xs">Per questa area servono almeno {minPx.w}×{minPx.h} px, oppure un file vettoriale (SVG).</p>
              <Checkbox
                className="mt-3 pl-6"
                label="Ho capito e voglio procedere con questa grafica"
                checked={!!asset.acknowledgedLowQuality}
                onChange={(e) => api.setArea(area.id, { asset: { ...asset, acknowledgedLowQuality: e.target.checked } })}
              />
            </div>
          )}
          {report && !report.blocking && report.messages.filter((m) => m.level !== 'error' && !m.text.startsWith('Risoluzione')).map((m) => (
            <p key={m.text} className="flex gap-2 text-xs text-ink-600">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{m.text}
            </p>
          ))}

          <div className="flex flex-wrap gap-2">
            {area.allow_upload && (
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-ink-200 px-3 text-sm font-semibold hover:border-ink-400">
                <Replace className="h-4 w-4" /> Sostituisci
                <input type="file" accept={ACCEPTED_GRAPHIC_TYPES.join(',')} className="sr-only" onChange={(e) => { void onFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
              </label>
            )}
            <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => { api.setArea(area.id, { enabled: false, asset: null }); setReport(null) }}>
              Rimuovi
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {area.allow_upload && (
            <Dropzone
              compact
              accept={ACCEPTED_GRAPHIC_TYPES.join(',')}
              onFiles={onFiles}
              disabled={uploading}
              label={uploading ? 'Caricamento e controllo qualità…' : 'Carica la grafica'}
              hint={`PNG trasparente, SVG, JPG o WebP · consigliati ≥ ${minPx.w}×${minPx.h} px`}
            />
          )}
          {area.allow_library && libItems.length > 0 && (
            <Button variant="secondary" size="sm" icon={<Library className="h-4 w-4" />} onClick={() => setLibOpen(true)}>
              Scegli dalla libreria
            </Button>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm font-medium text-danger-600">{error}</p>}

      <Modal open={libOpen} onClose={() => setLibOpen(false)} title="Libreria grafiche" size="lg">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {libItems.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => { api.pickLibraryAsset(area, a); setLibOpen(false) }}
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

export function GraphicsSection({ api, library }: { api: ConfiguratorApi; library: CustomizationAsset[] }) {
  const { settings } = useSettings()
  const graphicAreas = api.areas.filter((a) => a.area_type === 'logo' || a.area_type === 'sponsor' || a.area_type === 'all_over')
  if (!graphicAreas.length) return null
  return (
    <div className="space-y-3">
      <div className="flex gap-3 rounded-2xl border border-gold-300 bg-gold-100/60 p-4 text-sm text-ink-800">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-gold-700" aria-hidden />
        <div>
          <p className="font-semibold">Usa grafiche ad alta risoluzione</p>
          <p className="mt-1 text-ink-600">
            Per una stampa nitida le grafiche devono avere almeno <strong>{settings.quality.min_dpi} dpi</strong> alla dimensione
            di stampa: con file a bassa risoluzione il prodotto risulterà sgranato. Controlliamo automaticamente dimensioni e
            risoluzione di ogni file. Per loghi e sponsor preferisci SVG o PNG con sfondo trasparente.
          </p>
        </div>
      </div>
      {graphicAreas.map((a) => <AreaCard key={a.id} api={api} area={a} library={library} />)}
    </div>
  )
}
