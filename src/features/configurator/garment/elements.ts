// Conversione degli elementi liberi (in cm sul pezzo del cartamodello) nelle coordinate della
// sagoma usata dall'anteprima 2D/3D. È un'approssimazione per la visualizzazione: il punto di
// riferimento del pezzo coincide con il centro collo della sagoma e la scala deriva dalla
// larghezza all'orlo. Il file di produzione usa invece le misure esatte del pezzo.

import type { CustomizationArea, ModelShape } from '@/types/db'
import type { Box } from '@/lib/printing'
import type { PlacedElement, PrintZone } from '@/types/config'
import { anchorOf, elementCenterMm, elementHeightCm, type ZonePiece } from '@/lib/patterns/placement'
import { bounds, type Vec } from '@/lib/patterns/geometry'
import { getShape } from './shapes'
import { MODEL_OUTLINES } from './outlines'
import { drawFittedText } from './panel'

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
  const neck = (side === 'back' ? s.backNeckY : s.neckY) ?? neckY(outline)
  return { k: silHem > 0 && pieceHem > 0 ? silHem / pieceHem : 0, neck, bounds: sb }
}

/**
 * Riquadro in cm (dal riferimento del pezzo, x a destra, y in basso) di un'area fissa dell'admin,
 * definita in percentuale del pannello della sagoma. Stessa corrispondenza usata per la produzione.
 */
export function areaBoxCm(area: Pick<CustomizationArea, 'x' | 'y' | 'width' | 'height' | 'side'>, shape: ModelShape, piece: ZonePiece | Pick<ZonePiece, 'outline' | 'anchor'>): Box | null {
  const { k, neck, bounds: b } = silhouetteFrame(shape, area.side, piece)
  if (!k) return null
  const W = b.maxX - b.minX, H = b.maxY - b.minY
  const x1 = b.minX + (Number(area.x) / 100) * W, x2 = x1 + (Number(area.width) / 100) * W
  const top = b.maxY - (Number(area.y) / 100) * H, bottom = top - (Number(area.height) / 100) * H
  const cm = (v: number) => Math.round((v / k / 10) * 10) / 10
  return { x1: cm(x1), x2: cm(x2), y1: cm(neck - top), y2: cm(neck - bottom) }
}

/**
 * Unità della sagoma per millimetro reale, per i capi senza cartamodello: dai modelli 3D
 * (altezza reale indicativa, taglia M) o, per le sagome disegnate, dalla maglia di riferimento
 * (sagoma alta 86,5 unità per 706 mm).
 */
export function silhouetteUnitsPerMm(shape: ModelShape): number {
  const gen = (MODEL_OUTLINES as Partial<Record<ModelShape, { unitPerMm: number }>>)[shape]
  return gen ? gen.unitPerMm * 100 : 86.5 / 706
}

/**
 * Pezzo "virtuale" per i capi senza cartamodello: davanti e dietro hanno il contorno della
 * sagoma convertito in mm attorno al centro collo, le maniche un rettangolo indicativo. Serve
 * a posizionare le aree in cm e all'anteprima; il file di produzione richiede il cartamodello.
 */
export function virtualPiece(shape: ModelShape, zone: PrintZone, kitItemId: string | null): ZonePiece {
  if (zone === 'sleeve_left' || zone === 'sleeve_right') {
    const long = !['tshirt', 'polo', 'tank', 'shorts', 'track_pants'].includes(shape)
    const h = long ? 600 : 250
    return { kitItemId, zone, size: '—', name: 'Manica', outline: [[-190, 0], [190, 0], [190, -h], [-190, -h]], anchor: { x: 0, y: 0 }, virtual: true }
  }
  const s = getShape(shape)
  const k = silhouetteUnitsPerMm(shape)
  const outline = (zone === 'front' ? s.front : s.back) as [number, number][]
  const neck = (zone === 'back' ? s.backNeckY : s.neckY) ?? neckY(outline)
  return {
    kitItemId, zone, size: '—', name: zone === 'front' ? 'Davanti' : 'Dietro',
    outline: outline.map(([x, y]) => [x / k, (y - neck) / k] as Vec), anchor: { x: 0, y: 0 }, virtual: true,
  }
}

const textCache = new Map<string, HTMLCanvasElement>()

/** Immagine di un testo (canvas trasparente nelle proporzioni dell'area), per anteprime e 3D. */
export function textImage(el: Pick<PlacedElement, 'text' | 'font' | 'color' | 'widthCm' | 'heightCm'>): HTMLCanvasElement {
  const w = Math.max(1, el.widthCm), h = Math.max(0.5, el.heightCm ?? el.widthCm / 4)
  const px = 40 // pixel per cm
  const key = `${el.text}|${el.font}|${el.color}|${w}|${h}`
  const hit = textCache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = Math.round(w * px)
  c.height = Math.round(h * px)
  const ctx = c.getContext('2d')
  if (ctx) drawFittedText(ctx, (el.text ?? '').toUpperCase(), 0, 0, c.width, c.height, { color: el.color || '#FFFFFF', outline: null, font: el.font ?? 'block' }, 'text')
  if (textCache.size > 200) textCache.clear()
  textCache.set(key, c)
  return c
}

/** Immagini per tutte le aree: le grafiche caricate e i testi disegnati. */
export function withTextImages(elements: PlacedElement[], images: Record<string, CanvasImageSource>): Record<string, CanvasImageSource> {
  const out = { ...images }
  for (const e of elements) if (e.kind === 'text' && e.text?.trim()) out[e.id] = textImage(e)
  return out
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
  const frame = piece.virtual ? null : silhouetteFrame(shape, side, piece)
  const k = frame ? frame.k : silhouetteUnitsPerMm(shape)
  const s = getShape(shape)
  const n = frame ? frame.neck : ((side === 'back' ? s.backNeckY : s.neckY) ?? neckY((side === 'front' ? s.front : s.back) as [number, number][]))
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
  band?: { image: CanvasImageSource; heightMm: number } | null,
) {
  const b = bounds(piece.outline)
  const w = Math.max(1, Math.round(b.width * SLEEVE_PX_PER_MM)), h = Math.max(1, Math.round(b.height * SLEEVE_PX_PER_MM))
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, w, h)
  if (fill || band) {
    ctx.save()
    ctx.beginPath()
    piece.outline.forEach(([x, y], i) => {
      const px = (x - b.minX) * SLEEVE_PX_PER_MM, py = (b.maxY - y) * SLEEVE_PX_PER_MM
      if (i) ctx.lineTo(px, py)
      else ctx.moveTo(px, py)
    })
    ctx.closePath()
    ctx.clip()
    if (fill) drawCover(ctx, fill, w, h)
    // fascia sul fondo della manica (polsino), alta band.heightMm
    if (band) {
      const bh = Math.min(h, band.heightMm * SLEEVE_PX_PER_MM)
      ctx.save()
      ctx.translate(0, h - bh)
      drawCover(ctx, band.image, w, bh)
      ctx.restore()
    }
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
  band?: { image: CanvasImageSource; heightMm: number } | null,
) {
  const elCanvas = document.createElement('canvas')
  drawSleeve(elCanvas, piece, elements, images, fill, band)
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
