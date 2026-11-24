// Disegno SVG di un pezzo di cartamodello con il punto di riferimento; facoltativamente
// il punto si trascina (editor) e si mostra il drittofilo.

import { useRef, type PointerEvent } from 'react'
import { bounds, outlinePath, round, type Vec } from '@/lib/patterns/geometry'

export function PieceShape({ outline, anchor, onAnchor, grainAngle = 0, className, mirror }: {
  outline: Vec[]
  anchor?: { x?: number; y?: number }
  onAnchor?: (a: { x: number; y: number }) => void
  grainAngle?: number
  mirror?: boolean
  className?: string
}) {
  const svg = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)
  const b = bounds(outline)
  const pad = Math.max(b.width, b.height) * 0.06
  const vb = `${-pad} ${-pad} ${b.width + pad * 2} ${b.height + pad * 2}`
  const ax = anchor?.x != null ? anchor.x - b.minX : null
  const ay = anchor?.y != null ? b.maxY - anchor.y : null
  const r = Math.max(b.width, b.height) * 0.018

  const toModel = (e: PointerEvent) => {
    const el = svg.current!
    const pt = el.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const p = pt.matrixTransform(el.getScreenCTM()!.inverse())
    return { x: round(Math.min(b.maxX, Math.max(b.minX, p.x + b.minX)), 1), y: round(Math.min(b.maxY, Math.max(b.minY, b.maxY - p.y)), 1) }
  }

  // drittofilo: freccia verticale al centro, ruotata dell'angolo indicato
  const cx = b.width / 2, cy = b.height / 2, gl = b.height * 0.32
  const ga = (grainAngle * Math.PI) / 180
  const gx = Math.sin(ga) * gl, gy = Math.cos(ga) * gl

  return (
    <svg
      ref={svg}
      viewBox={vb}
      className={className}
      style={mirror ? { transform: 'scaleX(-1)' } : undefined}
      onPointerMove={(e) => { if (dragging.current && onAnchor) onAnchor(toModel(e)) }}
      onPointerUp={() => { dragging.current = false }}
      onPointerLeave={() => { dragging.current = false }}
      onPointerDown={(e) => {
        if (!onAnchor) return
        dragging.current = true
        ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
        onAnchor(toModel(e))
      }}
      role="img"
      aria-label={`Pezzo ${round(b.width / 10, 1)} × ${round(b.height / 10, 1)} cm`}
    >
      <path d={outlinePath(outline, b)} className="fill-ink-100 stroke-ink-900" strokeWidth={Math.max(b.width, b.height) * 0.004} vectorEffect="non-scaling-stroke" />
      <line x1={cx - gx} y1={cy + gy} x2={cx + gx} y2={cy - gy} className="stroke-ink-400" strokeWidth={1.2} vectorEffect="non-scaling-stroke" strokeDasharray="4 3" />
      {ax != null && ay != null && (
        <g className={onAnchor ? 'cursor-grab' : undefined}>
          <line x1={ax} y1={-pad} x2={ax} y2={b.height + pad} className="stroke-gold-500" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="6 4" />
          <circle cx={ax} cy={ay} r={r} className="fill-gold-500 stroke-white" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </g>
      )}
    </svg>
  )
}
