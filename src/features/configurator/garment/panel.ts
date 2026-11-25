// Disegna un pannello (fronte o retro) del capo su canvas: colore base, grafiche
// all-over, profili, loghi/sponsor, nomi e numeri. Usato come texture 3D e per le
// anteprime PNG salvate con l'ordine.

import type { AreaType, AreaSide } from '@/types/db'
import type { TextStyle } from '@/types/config'
import { getShape, toCanvas, type GarmentShape, type Pt } from './shapes'
import type { ModelShape } from '@/types/db'

export interface PanelArea {
  id: string
  name: string
  side: AreaSide
  area_type: AreaType
  x: number
  y: number
  width: number
  height: number
}

export interface PanelLayer {
  area: PanelArea
  image?: CanvasImageSource | null
  scale?: number
  text?: string
}

export interface PanelSpec {
  shape: ModelShape
  side: AreaSide
  baseColor: string
  secondaryColor?: string | null
  layers: PanelLayer[]
  textStyle: TextStyle
  guides?: boolean
  /**
   * Ombreggiatura del contorno (profondità nella vista piana). Va esclusa dai pannelli usati come
   * texture del modello 3D, dove il bordo della sagoma verrebbe proiettato come una linea.
   */
  edges?: boolean
  highlightId?: string | null
  /** Grafica all-over del cliente: copre l'intero pannello, sotto loghi, nomi e numeri. */
  allOver?: CanvasImageSource | null
  /** Loghi e sponsor liberi in unità della sagoma (centro, dimensioni, rotazione oraria in gradi). */
  elements?: { image: CanvasImageSource; cx: number; cy: number; w: number; h: number; rotation: number }[]
}

export const PANEL_WIDTH = 1536

export function panelSize(shape: GarmentShape, width = PANEL_WIDTH) {
  const { minX, maxX, minY, maxY } = shape.bounds
  return { width, height: Math.round(width * ((maxY - minY) / (maxX - minX))) }
}

function luminance(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export const isDark = (hex: string) => luminance(hex) < 0.35

function tracePath(ctx: CanvasRenderingContext2D, pts: Pt[], shape: GarmentShape, w: number, h: number, close = true) {
  ctx.beginPath()
  pts.forEach((p, i) => {
    const [x, y] = toCanvas(p, shape.bounds, w, h)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  if (close) ctx.closePath()
}

function imageSize(img: CanvasImageSource): [number, number] {
  if (img instanceof HTMLImageElement) return [img.naturalWidth || img.width, img.naturalHeight || img.height]
  if (img instanceof HTMLCanvasElement || img instanceof ImageBitmap) return [img.width, img.height]
  if (typeof OffscreenCanvas !== 'undefined' && img instanceof OffscreenCanvas) return [img.width, img.height]
  return [1, 1]
}

function drawImageFit(
  ctx: CanvasRenderingContext2D, img: CanvasImageSource,
  rx: number, ry: number, rw: number, rh: number, mode: 'contain' | 'cover', scale = 1,
) {
  const [iw, ih] = imageSize(img)
  if (!iw || !ih) return
  const s = (mode === 'cover' ? Math.max(rw / iw, rh / ih) : Math.min(rw / iw, rh / ih)) * (mode === 'cover' ? 1 : scale)
  const dw = iw * s
  const dh = ih * s
  ctx.drawImage(img, rx + (rw - dw) / 2, ry + (rh - dh) / 2, dw, dh)
}

export function drawFittedText(
  ctx: CanvasRenderingContext2D, text: string, rx: number, ry: number, rw: number, rh: number,
  style: TextStyle, kind: 'text' | 'number',
) {
  const family = style.font === 'classic' ? '"Inter Variable", Inter, sans-serif' : '"Archivo Variable", Archivo, sans-serif'
  const weight = kind === 'number' ? 800 : 700
  let size = rh * (kind === 'number' ? 0.92 : 0.78)
  const c = ctx as CanvasRenderingContext2D & { fontStretch?: string; letterSpacing?: string }
  if (style.font === 'block' && 'fontStretch' in c) c.fontStretch = kind === 'number' ? 'semi-expanded' : 'expanded'
  ctx.font = `${weight} ${size}px ${family}`
  const measured = ctx.measureText(text).width
  if (measured > rw * 0.96) {
    size *= (rw * 0.96) / measured
    ctx.font = `${weight} ${size}px ${family}`
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const cx = rx + rw / 2
  const cy = ry + rh / 2 + size * 0.04
  if (style.outline) {
    ctx.lineJoin = 'round'
    ctx.lineWidth = Math.max(2, size * 0.09)
    ctx.strokeStyle = style.outline
    ctx.strokeText(text, cx, cy)
  }
  ctx.fillStyle = style.color
  ctx.fillText(text, cx, cy)
}

function strokeEdges(ctx: CanvasRenderingContext2D, outline: Pt[], shape: GarmentShape, w: number, h: number) {
  const unit = w / 100
  tracePath(ctx, outline, shape, w, h)
  ctx.lineWidth = unit * 5
  ctx.strokeStyle = 'rgba(0,0,0,0.10)'
  ctx.stroke()
  ctx.lineWidth = unit * 1.6
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'
  ctx.stroke()
}

/** Ombreggiatura del contorno su un pannello disegnato senza (vista piana del configuratore). */
export function drawPanelEdges(ctx: CanvasRenderingContext2D, kind: ModelShape, side: AreaSide, w: number, h: number) {
  const shape = getShape(kind)
  const outline = side === 'front' ? shape.front : shape.back
  ctx.save()
  tracePath(ctx, outline, shape, w, h)
  ctx.clip()
  strokeEdges(ctx, outline, shape, w, h)
  ctx.restore()
}

/** Disegna il pannello sul canvas indicato (ridimensionandolo se necessario). */
export function drawPanel(canvas: HTMLCanvasElement, spec: PanelSpec, width = PANEL_WIDTH) {
  const shape = getShape(spec.shape)
  const { width: w, height: h } = panelSize(shape, width)
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const outline = spec.side === 'front' ? shape.front : shape.back
  const unit = w / 100

  ctx.save()
  ctx.clearRect(0, 0, w, h)
  tracePath(ctx, outline, shape, w, h)
  ctx.clip()

  ctx.fillStyle = spec.baseColor
  ctx.fillRect(0, 0, w, h)

  const rect = (a: PanelArea) => [(a.x / 100) * w, (a.y / 100) * h, (a.width / 100) * w, (a.height / 100) * h] as const
  const sideLayers = spec.layers.filter((l) => l.area.side === spec.side)

  // 1. Grafiche all-over: quella del cliente copre tutto il pannello, quelle in area riempiono l'area
  if (spec.allOver) drawImageFit(ctx, spec.allOver, 0, 0, w, h, 'cover')
  for (const l of sideLayers) {
    if (l.area.area_type === 'all_over' && l.image) drawImageFit(ctx, l.image, ...rect(l.area), 'cover')
  }

  // 2. Profili in colore secondario
  if (spec.secondaryColor) {
    ctx.strokeStyle = spec.secondaryColor
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = unit * 3.2
    for (const t of spec.side === 'front' ? shape.trims.front : shape.trims.back) {
      tracePath(ctx, t, shape, w, h, false)
      ctx.stroke()
    }
  }

  // 3. Loghi e sponsor
  for (const l of sideLayers) {
    if ((l.area.area_type === 'logo' || l.area.area_type === 'sponsor') && l.image) {
      drawImageFit(ctx, l.image, ...rect(l.area), 'contain', l.scale ?? 1)
    }
  }

  // 3b. Loghi e sponsor liberi (posizionati dal cliente)
  for (const e of spec.elements ?? []) {
    const [cx, cy] = toCanvas([e.cx, e.cy], shape.bounds, w, h)
    const sx = w / (shape.bounds.maxX - shape.bounds.minX)
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate((e.rotation * Math.PI) / 180)
    ctx.drawImage(e.image, (-e.w * sx) / 2, (-e.h * sx) / 2, e.w * sx, e.h * sx)
    ctx.restore()
  }

  // 4. Nomi e numeri
  for (const l of sideLayers) {
    if ((l.area.area_type === 'text' || l.area.area_type === 'number') && l.text) {
      drawFittedText(ctx, l.text, ...rect(l.area), spec.textStyle, l.area.area_type)
    }
  }

  // 5. Ombreggiatura dei bordi (profondità nella vista piana)
  if (spec.edges !== false) strokeEdges(ctx, outline, shape, w, h)

  // 6. Guide delle aree (solo in modifica)
  if (spec.guides) {
    const dark = isDark(spec.baseColor)
    for (const l of sideLayers) {
      const filled = !!l.image || !!l.text
      const hl = spec.highlightId === l.area.id
      if (filled && !hl) continue
      // L'area all-over copre l'intero pannello: mostrala solo quando è evidenziata
      if (l.area.area_type === 'all_over' && !hl) continue
      const [x, y, rw, rh] = rect(l.area)
      ctx.setLineDash([unit * 1.2, unit * 0.9])
      ctx.lineWidth = unit * (hl ? 0.65 : 0.45)
      ctx.strokeStyle = hl ? '#C2A063' : dark ? 'rgba(255,255,255,0.55)' : 'rgba(14,14,16,0.4)'
      ctx.strokeRect(x, y, rw, rh)
      ctx.setLineDash([])
      if (!filled) {
        ctx.font = `600 ${Math.max(unit * 1.9, 11)}px "Inter Variable", Inter, sans-serif`
        ctx.fillStyle = hl ? '#C2A063' : dark ? 'rgba(255,255,255,0.7)' : 'rgba(14,14,16,0.5)'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(l.area.name, x + rw / 2, y + rh / 2, rw * 0.92)
      }
    }
  }
  ctx.restore()
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/** Assicura che i font usati per nomi/numeri siano caricati prima di disegnare. */
export async function ensureFonts() {
  if (!('fonts' in document)) return
  await Promise.allSettled([
    document.fonts.load('800 64px "Archivo Variable"'),
    document.fonts.load('700 64px "Inter Variable"'),
  ])
}
