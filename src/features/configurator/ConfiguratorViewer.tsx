import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Box, Eye, EyeOff, Image as ImageIcon, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Spinner } from '@/components/ui/Spinner'
import type { ConfiguratorApi } from './useConfigurator'
import { supportsWebGL } from './garment/webgl'
import { SHAPE_LABEL } from './garment/shapes'

const GarmentViewer = lazy(() => import('./garment/GarmentViewer'))

function FlatPreview({ source, version, label }: { source: HTMLCanvasElement; version: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c || !source.width) return
    c.width = source.width
    c.height = source.height
    c.getContext('2d')?.drawImage(source, 0, 0)
  }, [source, version])
  return <canvas ref={ref} role="img" aria-label={label} className="mx-auto h-full max-h-full w-auto max-w-full object-contain drop-shadow-xl" />
}

export function ConfiguratorViewer({ api }: { api: ConfiguratorApi }) {
  const [webgl] = useState(() => supportsWebGL())
  const [mode, setMode] = useState<'3d' | '2d'>(webgl ? '3d' : '2d')
  const [resetToken, setResetToken] = useState(0)
  const { product, view, setView, frontCanvas, backCanvas, version, shape, guides, setGuides } = api

  const seg = (active: boolean) =>
    cn('h-9 rounded-lg px-3 text-xs font-semibold transition-colors', active ? 'bg-ink-900 text-white' : 'text-ink-600 hover:text-ink-900')

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-2xl bg-gradient-to-b from-white to-ink-100">
      {product.product_type === 'kit' && product.kit_items.length > 1 && (
        <div className="no-scrollbar flex gap-1 overflow-x-auto p-2" role="group" aria-label="Componente del kit">
          {product.kit_items.map((k) => (
            <button key={k.id} type="button" className={seg(api.activeKitItem === k.id)} onClick={() => api.setActiveKitItem(k.id)} aria-pressed={api.activeKitItem === k.id}>
              {k.label}
            </button>
          ))}
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        {mode === '3d' ? (
          <Suspense fallback={<div className="flex h-full items-center justify-center text-ink-400"><Spinner label="Caricamento anteprima 3D" /></div>}>
            <GarmentViewer shape={shape} front={frontCanvas} back={backCanvas} version={version} view={view} resetToken={resetToken} className="!absolute inset-0 touch-none" />
          </Suspense>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <FlatPreview
              source={view === 'front' ? frontCanvas : backCanvas}
              version={version}
              label={`Anteprima ${view === 'front' ? 'fronte' : 'retro'} — ${SHAPE_LABEL[shape]}`}
            />
          </div>
        )}
        {mode === '3d' && (
          <p className="pointer-events-none absolute bottom-2 left-0 right-0 text-center text-2xs text-ink-400">
            Trascina per ruotare · pizzica o scorri per lo zoom
          </p>
        )}
      </div>

      <div className="glass glass-light flex flex-wrap items-center justify-between gap-2 !rounded-none p-2">
        <div className="flex rounded-xl bg-ink-100 p-0.5" role="group" aria-label="Lato visualizzato">
          <button type="button" className={seg(view === 'front')} aria-pressed={view === 'front'} onClick={() => setView('front')}>Fronte</button>
          <button type="button" className={seg(view === 'back')} aria-pressed={view === 'back'} onClick={() => setView('back')}>Retro</button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setGuides(!guides)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-ink-600 hover:bg-ink-100"
            aria-pressed={guides}
          >
            {guides ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            <span className="hidden sm:inline">Aree</span>
          </button>
          {mode === '3d' && (
            <button type="button" onClick={() => setResetToken((t) => t + 1)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100" aria-label="Ripristina vista">
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          {webgl && (
            <div className="flex rounded-xl bg-ink-100 p-0.5" role="group" aria-label="Modalità anteprima">
              <button type="button" className={seg(mode === '3d')} aria-pressed={mode === '3d'} onClick={() => setMode('3d')}>
                <Box className="h-4 w-4 sm:hidden" aria-hidden /><span className="hidden sm:inline">3D</span><span className="sr-only sm:hidden">Vista 3D</span>
              </button>
              <button type="button" className={seg(mode === '2d')} aria-pressed={mode === '2d'} onClick={() => setMode('2d')}>
                <ImageIcon className="h-4 w-4 sm:hidden" aria-hidden /><span className="hidden sm:inline">2D</span><span className="sr-only sm:hidden">Vista piana</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
