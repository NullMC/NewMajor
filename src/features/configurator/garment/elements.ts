// Conversione degli elementi liberi (in cm sul pezzo del cartamodello) nelle coordinate della
// sagoma usata dall'anteprima 2D/3D. È un'approssimazione per la visualizzazione: il punto di
// riferimento del pezzo coincide con il centro collo della sagoma e la scala deriva dalla
// larghezza all'orlo. Il file di produzione usa invece le misure esatte del pezzo.

import type { ModelShape } from '@/types/db'
import type { PlacedElement } from '@/types/config'
import { anchorOf, elementCenterMm, elementHeightCm, type ZonePiece } from '@/lib/patterns/placement'
import { bounds, type Vec } from '@/lib/patterns/geometry'
import { getShape } from './shapes'

/** Larghezza del poligono alla quota y (distanza tra la prima e l'ultima intersezione). */
function widthAt(pts: Vec[] | [number, number][], y: number): number {
  const xs: number[] = []
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [x1, y1] = pts[j], [x2, y2] = pts[i]
    if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1))
  }
  return xs.length >= 2 ? Math.max(...xs) - Math.min(...xs) : 0
}

/** Larghezza del tratto che contiene l'asse centrale (x = 0) alla quota y. */
function centreWidthAt(pts: [number, number][], y: number): number {
  const xs: number[] = []
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [x1, y1] = pts[j], [x2, y2] = pts[i]
    if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1))
  }
  const left = Math.max(...xs.filter((x) => x <= 0)), right = Math.min(...xs.filter((x) => x > 0))
  return Number.isFinite(left) && Number.isFinite(right) ? right - left : widthAt(pts, y)
}

/** Bordo superiore della sagoma sull'asse centrale (centro collo). */
function neckY(pts: [number, number][]): number {
  const ys: number[] = []
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [x1, y1] = pts[j], [x2, y2] = pts[i]
    if ((x1 <= 0 && x2 > 0) || (x2 <= 0 && x1 > 0)) ys.push(y1 + ((0 - x1) / (x2 - x1)) * (y2 - y1))
  }
  return ys.length ? Math.max(...ys) : Math.max(...pts.map((p) => p[1]))
}

export interface SilhouetteElement { image: CanvasImageSource; cx: number; cy: number; w: number; h: number; rotation: number }

/**
 * Corrispondenza tra pezzo reale e sagoma: `k` = unità della sagoma per millimetro (dalla
 * larghezza all'orlo), `neck` = quota del centro collo della sagoma (dove cade il riferimento).
 */
export function silhouetteFrame(shape: ModelShape, side: 'front' | 'back', piece: ZonePiece | Pick<ZonePiece, 'outline' | 'anchor'>) {
  const s = getShape(shape)
  const outline = (side === 'front' ? s.front : s.back) as [number, number][]
  const sb = s.bounds
  const pb = bounds(piece.outline)
  // capi inferiori: si confronta la vita; altrimenti l'orlo del busto (sulle sagome dai modelli
  // 3D si misura solo il tratto centrale, perché le maniche possono scendere sotto l'orlo)
  const silY = s.bottom ? (s.neckY ?? sb.maxY) - (sb.maxY - sb.minY) * 0.02 : (s.hemY ?? sb.minY) + (sb.maxY - sb.minY) * 0.02
  const pieceY = s.bottom ? pb.maxY - pb.height * 0.02 : pb.minY + pb.height * 0.02
  const silHem = s.hemY !== undefined ? centreWidthAt(outline, silY) : widthAt(outline, silY)
  const pieceHem = widthAt(piece.outline, pieceY)
  return { k: silHem > 0 && pieceHem > 0 ? silHem / pieceHem : 0, neck: s.neckY ?? neckY(outline), bounds: sb }
}

/** Elementi di davanti/dietro convertiti in unità della sagoma per il pannello indicato. */
export function toSilhouette(
  shape: ModelShape,
  side: 'front' | 'back',
  elements: PlacedElement[],
  piece: ZonePiece | null,
  images: Record<string, CanvasImageSource>,
): SilhouetteElement[] {
  if (!piece) return []
  const { k, neck: n } = silhouetteFrame(shape, side, piece)
  if (!k) return []
  const [ax, ay] = anchorOf(piece)
  return elements
    .filter((e) => e.zone === side && images[e.id])
    .map((e) => {
      const [px, py] = elementCenterMm(e, piece)
      return { image: images[e.id], cx: (px - ax) * k, cy: n + (py - ay) * k, w: e.widthCm * 10 * k, h: elementHeightCm(e) * 10 * k, rotation: e.rotation || 0 }
    })
}

const SLEEVE_PX_PER_MM = 3

/** Disegna l'immagine in modalità "cover" sul riquadro indicato. */
function drawCover(ctx: CanvasRenderingContext2D, img: CanvasImageSource, w: number, h: number) {
  const iw = (img as HTMLImageElement).naturalWidth || (img as { width: number }).width || 1
  const ih = (img as HTMLImageElement).naturalHeight || (img as { height: number }).height || 1
  const s = Math.max(w / iw, h / ih)
  ctx.drawImage(img, (w - iw * s) / 2, (h - ih * s) / 2, iw * s, ih * s)
}

/**
 * Disegna gli elementi della manica (ed eventualmente la grafica all-over, ritagliata sul pezzo)
 * su un canvas trasparente che copre il pezzo (3 px/mm).
 */
export function drawSleeve(
  canvas: HTMLCanvasElement, piece: ZonePiece, elements: PlacedElement[], images: Record<string, CanvasImageSource>,
  fill?: CanvasImageSource | null,
) {
  const b = bounds(piece.outline)
  const w = Math.max(1, Math.round(b.width * SLEEVE_PX_PER_MM)), h = Math.max(1, Math.round(b.height * SLEEVE_PX_PER_MM))
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, w, h)
  if (fill) {
    ctx.save()
    ctx.beginPath()
    piece.outline.forEach(([x, y], i) => {
      const px = (x - b.minX) * SLEEVE_PX_PER_MM, py = (b.maxY - y) * SLEEVE_PX_PER_MM
      if (i) ctx.lineTo(px, py)
      else ctx.moveTo(px, py)
    })
    ctx.closePath()
    ctx.clip()
    drawCover(ctx, fill, w, h)
    ctx.restore()
  }
  for (const e of elements) {
    const img = images[e.id]
    if (!img) continue
    const [px, py] = elementCenterMm(e, piece)
    ctx.save()
    ctx.translate((px - b.minX) * SLEEVE_PX_PER_MM, (b.maxY - py) * SLEEVE_PX_PER_MM)
    ctx.rotate(((e.rotation || 0) * Math.PI) / 180)
    const ew = e.widthCm * 10 * SLEEVE_PX_PER_MM, eh = elementHeightCm(e) * 10 * SLEEVE_PX_PER_MM
    ctx.drawImage(img, -ew / 2, -eh / 2, ew, eh)
    ctx.restore()
  }
}

/** Dati della manica per il visualizzatore 3D: canvas, riquadro del pezzo e riferimento (mm). */
export function sleeveInfo(piece: ZonePiece | null, canvas: HTMLCanvasElement) {
  if (!piece) return null
  const b = bounds(piece.outline)
  return { canvas, rect: [b.minX, b.minY, b.width, b.height] as [number, number, number, number], anchor: anchorOf(piece) as [number, number] }
}

/** Anteprima di una manica per l'ordine: il pezzo reale nel colore di fondo con i suoi elementi. */
export function drawSleevePreview(
  piece: ZonePiece, elements: PlacedElement[], images: Record<string, CanvasImageSource>, baseColor: string,
  fill?: CanvasImageSource | null,
) {
  const elCanvas = document.createElement('canvas')
  drawSleeve(elCanvas, piece, elements, images, fill)
  const b = bounds(piece.outline)
  const pad = 40
  const c = document.createElement('canvas')
  c.width = elCanvas.width + pad * 2
  c.height = elCanvas.height + pad * 2
  const ctx = c.getContext('2d')!
  ctx.translate(pad, pad)
  ctx.beginPath()
  piece.outline.forEach(([x, y], i) => {
    const px = (x - b.minX) * SLEEVE_PX_PER_MM, py = (b.maxY - y) * SLEEVE_PX_PER_MM
    if (i) ctx.lineTo(px, py)
    else ctx.moveTo(px, py)
  })
  ctx.closePath()
  ctx.fillStyle = baseColor
  ctx.fill()
  ctx.save()
  ctx.clip()
  ctx.drawImage(elCanvas, 0, 0)
  ctx.restore()
  ctx.lineWidth = 3
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'
  ctx.stroke()
  return c
}
