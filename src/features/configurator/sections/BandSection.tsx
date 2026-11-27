// Fasce longitudinali: dal colletto lungo la spalla e la sommità della manica (capi superiori) o lungo
// il lato esterno della gamba dalla vita all'orlo (pantaloncini e pantaloni).
// Il cliente sceglie nessuna fascia, un colore diverso o una grafica stampata.

import { useState } from 'react'
import { Replace } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/format'
import { errorMessage } from '@/lib/errors'
import { ACCEPTED_GRAPHIC_TYPES } from '@/lib/imageQuality'
import { Dropzone } from '@/components/ui/Dropzone'
import type { ConfiguratorApi } from '../useConfigurator'
import { Thumb } from './GraphicsSection'

export function BandSection({ api }: { api: ConfiguratorApi }) {
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const b = api.band
  const mode = b?.mode ?? 'none'
  const source = api.product.product_type === 'kit' ? api.kitItem : api.product
  const price = Number(source?.band_price ?? 0)

  const upload = async (f: File) => {
    setError(null)
    setUploading(true)
    try {
      const r = await api.uploadBand(f)
      if (r.blocking) setError(r.messages.find((m) => m.level === 'error')?.text ?? 'File non valido.')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setUploading(false)
    }
  }

  const opt = (on: boolean) => cn('h-10 rounded-full px-4 text-sm font-semibold transition-colors', on ? 'bg-ink-900 text-white' : 'bg-white text-ink-700 ring-1 ring-ink-200 hover:ring-ink-400')

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600">
        {api.isBottomShape
          ? <>Una fascia larga {String(api.bandHeightCm).replace('.', ',')} cm lungo il lato esterno di ogni gamba, dalla vita all’orlo,</>
          : <>Una fascia larga {String(api.bandHeightCm).replace('.', ',')} cm che parte dal colletto, segue la spalla e scende lungo la manica fino al polsino,</>}
        {' '}in un colore diverso o con una grafica stampata.
        {price > 0 && <> Costo: <strong>+{formatPrice(price)}</strong> a capo.</>}
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Fascia">
        <button type="button" className={opt(mode === 'none')} aria-pressed={mode === 'none'} onClick={() => api.setBand(null)}>Nessuna</button>
        <button type="button" className={opt(mode === 'color')} aria-pressed={mode === 'color'} onClick={() => api.setBand({ mode: 'color', color: b?.color ?? api.secondaryColor ?? '#111111' })}>Colore diverso</button>
        <button type="button" className={opt(mode === 'graphic')} aria-pressed={mode === 'graphic'} onClick={() => { if (mode !== 'graphic') api.setBand({ mode: 'graphic', asset: null }) }}>Grafica stampata</button>
      </div>
      {mode === 'color' && (
        <label className="flex items-center gap-3 text-sm font-medium text-ink-700">
          Colore della fascia
          <input type="color" value={b?.color ?? '#111111'} onChange={(e) => api.setBand({ mode: 'color', color: e.target.value.toUpperCase() })} className="h-10 w-16 cursor-pointer rounded-lg border border-ink-200 bg-white p-1" />
        </label>
      )}
      {mode === 'graphic' && (b?.asset ? (
        <div className="flex items-center gap-3">
          <Thumb asset={b.asset} />
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{b.asset.name}</p>
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-ink-200 px-3 text-sm font-semibold hover:border-ink-400">
            <Replace className="h-4 w-4" /> Sostituisci
            <input type="file" accept={ACCEPTED_GRAPHIC_TYPES.join(',')} className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
          </label>
        </div>
      ) : (
        <Dropzone compact accept={ACCEPTED_GRAPHIC_TYPES.join(',')} disabled={uploading} onFiles={(fs) => { if (fs[0]) void upload(fs[0]) }}
          label={uploading ? 'Caricamento…' : 'Carica la grafica della fascia'} hint="La grafica riempie la fascia per tutta la circonferenza" />
      ))}
      {error && <p role="alert" className="text-sm font-medium text-danger-600">{error}</p>}
    </div>
  )
}
