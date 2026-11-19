import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import type { AreaSide, CustomizationArea, ModelShape } from '@/types/db'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { useUi } from '@/components/ui/Toast'
import { drawPanel } from '@/features/configurator/garment/panel'
import { SHAPE_LABEL } from '@/features/configurator/garment/shapes'

type Box = Pick<CustomizationArea, 'x' | 'y' | 'width' | 'height'>
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const round = (v: number) => Math.round(v * 10) / 10

/**
 * Editor visuale delle aree di personalizzazione: trascina per spostare,
 * usa la maniglia in basso a destra per ridimensionare. Salva al rilascio.
 */
export function AreaCanvasEditor({ shape, areas, onChanged }: { shape: ModelShape; areas: CustomizationArea[]; onChanged: () => void }) {
  const { toast } = useUi()
  const [side, setSide] = useState<AreaSide>('front')
  const [live, setLive] = useState<Record<string, Box>>({})
  const [selected, setSelected] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: string; mode: 'move' | 'resize'; startX: number; startY: number; box: Box } | null>(null)

  const sideAreas = useMemo(() => areas.filter((a) => a.side === side), [areas, side])

  useEffect(() => {
    if (!canvasRef.current) return
    drawPanel(canvasRef.current, { shape, side, baseColor: '#E9E8E4', secondaryColor: '#C9C9CF', layers: [], textStyle: { color: '#000', outline: null, font: 'block' } }, 900)
  }, [shape, side])

  const boxOf = (a: CustomizationArea): Box => live[a.id] ?? { x: Number(a.x), y: Number(a.y), width: Number(a.width), height: Number(a.height) }

  const onDown = (e: RPointerEvent, a: CustomizationArea, mode: 'move' | 'resize') => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setSelected(a.id)
    drag.current = { id: a.id, mode, startX: e.clientX, startY: e.clientY, box: boxOf(a) }
  }
  const onMove = (e: RPointerEvent) => {
    const d = drag.current
    const el = wrap.current
    if (!d || !el) return
    const rect = el.getBoundingClientRect()
    const dx = ((e.clientX - d.startX) / rect.width) * 100
    const dy = ((e.clientY - d.startY) / rect.height) * 100
    const b = d.box
    const next = d.mode === 'move'
      ? { ...b, x: round(clamp(b.x + dx, 0, 100 - b.width)), y: round(clamp(b.y + dy, 0, 100 - b.height)) }
      : { ...b, width: round(clamp(b.width + dx, 2, 100 - b.x)), height: round(clamp(b.height + dy, 2, 100 - b.y)) }
    setLive((l) => ({ ...l, [d.id]: next }))
  }
  const onUp = async () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    const box = live[d.id]
    if (!box) return
    const { error } = await supabase.from('customization_areas').update(box).eq('id', d.id)
    if (error) toast(errorMessage(error), 'error')
    else onChanged()
  }

  // Quando i dati salvati arrivano, rimuovi le posizioni temporanee
  const signature = areas.map((a) => `${a.id}:${a.x}:${a.y}:${a.width}:${a.height}`).join('|')
  useEffect(() => setLive({}), [signature])

  return (
    <div className="surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Posizionamento aree · {SHAPE_LABEL[shape]}</p>
        <div className="flex rounded-xl bg-ink-100 p-0.5 text-xs font-semibold" role="group" aria-label="Lato">
          {(['front', 'back'] as const).map((s) => (
            <button key={s} type="button" onClick={() => setSide(s)} aria-pressed={side === s} className={cn('h-8 rounded-lg px-3', side === s ? 'bg-ink-900 text-white' : 'text-ink-600')}>
              {s === 'front' ? 'Fronte' : 'Retro'}
            </button>
          ))}
        </div>
      </div>
      <div className="mx-auto max-w-md">
        <div ref={wrap} className="relative touch-none select-none" onPointerMove={onMove} onPointerUp={() => void onUp()} onPointerCancel={() => void onUp()}>
          <canvas ref={canvasRef} className="block h-auto w-full" aria-hidden />
          {sideAreas.map((a) => {
            const b = boxOf(a)
            return (
              <div
                key={a.id}
                onPointerDown={(e) => onDown(e, a, 'move')}
                className={cn(
                  'absolute flex cursor-move items-center justify-center border-2 border-dashed text-center text-[10px] font-semibold leading-tight',
                  selected === a.id ? 'border-gold-600 bg-gold-500/20 text-gold-800' : 'border-ink-500 bg-ink-900/5 text-ink-700',
                  !a.is_active && 'opacity-40',
                )}
                style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.width}%`, height: `${b.height}%` }}
                role="img"
                aria-label={`${a.name}: x ${b.x}%, y ${b.y}%, ${b.width}×${b.height}%`}
              >
                <span className="pointer-events-none px-1">{a.name}</span>
                <span onPointerDown={(e) => onDown(e, a, 'resize')} className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-sm border-2 border-white bg-ink-900" aria-hidden />
              </div>
            )
          })}
        </div>
      </div>
      <p className="mt-3 text-xs text-ink-500">Trascina le aree per spostarle; usa il quadratino per ridimensionarle. Le coordinate sono in percentuale del pannello. La dimensione di stampa (cm) si imposta nei campi dell’area.</p>
    </div>
  )
}
