// Editor di posizionamento delle aree di stampa sul pezzo (cartamodello della taglia di
// riferimento o pezzo indicativo dalla sagoma). Coordinate in millimetri: trascina per spostare,
// maniglia d'angolo per ridimensionare, maniglia superiore per ruotare. Il rettangolo oro è
// l'area massima di stampa della zona. Tastiera: frecce per spostare (Maiusc = 1 cm), + e − per
// la dimensione, [ e ] per ruotare, Canc per eliminare.

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { RotateCw } from 'lucide-react'
import type { PlacedElement, PrintZone } from '@/types/config'
import { cn } from '@/lib/cn'
import { bounds, outlinePath, round } from '@/lib/patterns/geometry'
import { anchorOf, elementCenterMm, elementHeightCm, placementIssue, ZONE_LABEL, type ZonePiece } from '@/lib/patterns/placement'
import { elementIssues, findZone, zoneBox } from '@/lib/printing'
import { textImage } from './garment/elements'
import { assetDisplayUrl } from '@/features/cart/assets'
import type { ConfiguratorApi } from './useConfigurator'

const fmt = (v: number) => String(round(v, 1)).replace('.', ',')

function useAssetUrls(elements: PlacedElement[]) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const key = elements.map((e) => `${e.id}:${e.asset?.path ?? e.asset?.localKey ?? ''}`).join('|')
  useEffect(() => {
    let alive = true
    void Promise.all(elements.filter((e) => e.asset).map(async (e) => [e.id, await assetDisplayUrl(e.asset!)] as const)).then((pairs) => {
      if (alive) setUrls(Object.fromEntries(pairs.filter(([, u]) => u)) as Record<string, string>)
    })
    return () => { alive = false }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return urls
}

type Drag = { id: string; mode: 'move' | 'resize' | 'rotate'; startX: number; startY: number; el: PlacedElement; cx: number; cy: number }

export function PlacementEditor({ api, zone, piece, baseColor }: { api: ConfiguratorApi; zone: PrintZone; piece: ZonePiece; baseColor: string }) {
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<Drag | null>(null)
  const [snapX, setSnapX] = useState(false)
  const els = api.elements.filter((e) => e.zone === zone && (e.kitItemId ?? null) === api.elementKit)
  const assetUrls = useAssetUrls(els)
  const urls: Record<string, string> = { ...assetUrls }
  for (const e of els) if (e.kind === 'text' && e.text?.trim()) urls[e.id] = textImage(e).toDataURL()
  const zoneRow = findZone(api.product.print_zones ?? [], zone, api.elementKit)
  const b = bounds(piece.outline)
  const pad = Math.max(b.width, b.height) * 0.05
  const [ax, ay] = anchorOf(piece)
  const toSvg = (x: number, y: number) => [x - b.minX, b.maxY - y] as const
  const [sax, say] = toSvg(ax, ay)
  const sel = els.find((e) => e.id === api.selectedElement) ?? null

  /** Punto del puntatore in mm del pezzo. */
  const pointer = (e: { clientX: number; clientY: number }) => {
    const p = svg.current!.createSVGPoint()
    p.x = e.clientX
    p.y = e.clientY
    const q = p.matrixTransform(svg.current!.getScreenCTM()!.inverse())
    return { x: q.x + b.minX, y: b.maxY - q.y }
  }

  const onDown = (e: PointerEvent, el: PlacedElement, mode: Drag['mode']) => {
    e.stopPropagation()
    api.setSelectedElement(el.id)
    const p = pointer(e)
    const [cx, cy] = elementCenterMm(el, piece)
    drag.current = { id: el.id, mode, startX: p.x, startY: p.y, el, cx, cy }
    svg.current?.setPointerCapture(e.pointerId)
  }

  const onMove = (e: PointerEvent) => {
    const d = drag.current
    if (!d) return
    const p = pointer(e)
    if (d.mode === 'move') {
      let xCm = d.el.xCm + (p.x - d.startX) / 10
      const snapped = Math.abs(xCm) < 0.6
      if (snapped) xCm = 0 // scatto sull'asse centrale
      setSnapX(snapped)
      api.updateElement(d.id, { xCm: round(xCm, 1), yCm: round(d.el.yCm - (p.y - d.startY) / 10, 1) })
    } else if (d.mode === 'resize') {
      const r0 = Math.hypot(d.startX - d.cx, d.startY - d.cy) || 1
      const r1 = Math.hypot(p.x - d.cx, p.y - d.cy)
      const k = r1 / r0
      api.updateElement(d.id, { widthCm: d.el.widthCm * k, heightCm: elementHeightCm(d.el) * k })
    } else {
      // angolo orario rispetto alla verticale verso l'alto
      const ang = (Math.atan2(p.x - d.cx, p.y - d.cy) * 180) / Math.PI
      let rot = Math.round(ang)
      for (const s of [-180, -90, 0, 90, 180]) if (Math.abs(rot - s) < 4) rot = s
      api.updateElement(d.id, { rotation: ((rot + 540) % 360) - 180 })
    }
  }
  const onUp = () => { drag.current = null; setSnapX(false) }

  const onKey = (e: KeyboardEvent) => {
    if (!sel) return
    const step = e.shiftKey ? 1 : 0.2
    const map: Record<string, Partial<PlacedElement>> = {
      ArrowLeft: { xCm: round(sel.xCm - step, 1) }, ArrowRight: { xCm: round(sel.xCm + step, 1) },
      ArrowUp: { yCm: round(sel.yCm - step, 1) }, ArrowDown: { yCm: round(sel.yCm + step, 1) },
      '+': { widthCm: sel.widthCm + 0.5 }, '=': { widthCm: sel.widthCm + 0.5 }, '-': { widthCm: Math.max(0.5, sel.widthCm - 0.5) },
      ']': { rotation: ((sel.rotation + 5 + 540) % 360) - 180 }, '[': { rotation: ((sel.rotation - 5 + 540) % 360) - 180 },
    }
    if (map[e.key]) { e.preventDefault(); api.updateElement(sel.id, map[e.key]) }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); api.removeElement(sel.id) }
    else if (e.key === 'Escape') api.setSelectedElement(null)
  }

  const handle = Math.max(b.width, b.height) * 0.022
  // fuori dall'area massima o sovrapposta (bloccante); vicino alla cucitura solo sui pezzi reali
  const selIssues = sel ? elementIssues(sel, api.elements, api.product.print_zones ?? [], api.techniques, true) : []
  const issue = selIssues.includes('outside') || selIssues.includes('overlap') ? 'outside' : sel && !piece.virtual ? placementIssue(sel, piece) : null

  return (
    <div className="flex h-full flex-col">
      <div
        className="relative min-h-0 flex-1 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
        tabIndex={0}
        onKeyDown={onKey}
        role="application"
        aria-label={`Posizionamento su ${ZONE_LABEL[zone].toLowerCase()}. Frecce per spostare, più e meno per la dimensione, parentesi quadre per ruotare.`}
      >
        <svg
          ref={svg}
          viewBox={`${-pad} ${-pad} ${b.width + pad * 2} ${b.height + pad * 2}`}
          className="h-full w-full touch-none select-none"
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerDown={() => api.setSelectedElement(null)}
        >
          <defs>
            <clipPath id={`clip-${zone}`}><path d={outlinePath(piece.outline, b)} /></clipPath>
          </defs>
          <path d={outlinePath(piece.outline, b)} fill={baseColor} className="stroke-ink-900/60" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          {/* asse centrale e punto di riferimento */}
          <line x1={sax} y1={-pad} x2={sax} y2={b.height + pad} className={snapX ? 'stroke-gold-500' : 'stroke-ink-900/25'} strokeWidth={snapX ? 2 : 1} strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
          <circle cx={sax} cy={say} r={handle * 0.45} className="fill-gold-500" />
          {zoneRow && (() => {
            const zb = zoneBox(zoneRow)
            const [zx, zy] = toSvg(ax + zb.x1 * 10, ay - zb.y1 * 10)
            return <rect x={zx} y={zy} width={(zb.x2 - zb.x1) * 10} height={(zb.y2 - zb.y1) * 10} fill="rgba(194,160,99,.08)" className="stroke-gold-500" strokeWidth={1.5} strokeDasharray="8 6" vectorEffect="non-scaling-stroke" />
          })()}
          <g clipPath={`url(#clip-${zone})`}>
            {els.map((el) => {
              const [cx, cy] = elementCenterMm(el, piece)
              const [sx, sy] = toSvg(cx, cy)
              const w = el.widthCm * 10, h = elementHeightCm(el) * 10
              return (
                <g key={el.id} transform={`translate(${sx} ${sy}) rotate(${el.rotation})`} onPointerDown={(e) => onDown(e, el, 'move')} className="cursor-move">
                  {urls[el.id] ? <image href={urls[el.id]} x={-w / 2} y={-h / 2} width={w} height={h} preserveAspectRatio="xMidYMid meet" /> : <rect x={-w / 2} y={-h / 2} width={w} height={h} className="fill-ink-900/10" />}
                  <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="transparent" />
                </g>
              )
            })}
          </g>
          {/* contorno e maniglie dell'elemento selezionato (fuori dal ritaglio, così restano visibili) */}
          {sel && (() => {
            const [cx, cy] = elementCenterMm(sel, piece)
            const [sx, sy] = toSvg(cx, cy)
            const w = sel.widthCm * 10, h = elementHeightCm(sel) * 10
            const tone = issue === 'outside' ? 'stroke-danger-600' : issue === 'near_edge' ? 'stroke-warning-600' : 'stroke-gold-500'
            return (
              <g transform={`translate(${sx} ${sy}) rotate(${sel.rotation})`}>
                <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="none" className={tone} strokeWidth={2} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" onPointerDown={(e) => onDown(e, sel, 'move')} />
                <line x1={0} y1={-h / 2} x2={0} y2={-h / 2 - handle * 2.2} className={tone} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                <circle cx={0} cy={-h / 2 - handle * 2.2} r={handle * 0.75} className="cursor-grab fill-white stroke-ink-900" strokeWidth={1.5} vectorEffect="non-scaling-stroke" onPointerDown={(e) => onDown(e, sel, 'rotate')} aria-label="Ruota" />
                {([[1, 1], [-1, 1], [1, -1], [-1, -1]] as const).map(([dx, dy]) => (
                  <rect key={`${dx}${dy}`} x={(dx * w) / 2 - handle / 2} y={(dy * h) / 2 - handle / 2} width={handle} height={handle} className="cursor-nwse-resize fill-white stroke-ink-900" strokeWidth={1.5} vectorEffect="non-scaling-stroke" onPointerDown={(e) => onDown(e, sel, 'resize')} />
                ))}
              </g>
            )
          })()}
        </svg>
      </div>
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2 px-1 pt-2 text-xs text-ink-600" aria-live="polite">
        {sel ? (
          <>
            <span className="font-mono tabular-nums">
              {sel.xCm === 0 ? 'centrato' : `${fmt(Math.abs(sel.xCm))} cm a ${sel.xCm > 0 ? 'destra' : 'sinistra'}`} · {fmt(sel.yCm)} cm {zone.startsWith('sleeve') ? 'dalla spalla' : 'sotto il collo'} · {fmt(sel.widthCm)} × {fmt(elementHeightCm(sel))} cm{sel.rotation ? ` · ${sel.rotation}°` : ''}
            </span>
            {issue && (
              <span className={cn('font-semibold', issue === 'outside' ? 'text-danger-600' : 'text-warning-700')}>
                {issue === 'outside' ? (selIssues.includes('overlap') ? 'Si sovrappone a un’altra area' : 'Fuori dall’area di stampa') : 'Vicino alla cucitura'}
              </span>
            )}
          </>
        ) : (
          <span className="flex items-center gap-1.5"><RotateCw className="h-3.5 w-3.5" aria-hidden />Seleziona un’area per spostarla, ridimensionarla o ruotarla. Il riquadro oro è l’area di stampa.</span>
        )}
      </div>
    </div>
  )
}
