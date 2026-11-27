// Ricostruzione del capo dai pezzi del cartamodello: ogni pezzo (davanti, dietro, maniche) viene
// disegnato su un canvas esattamente come nel file di produzione (fondo o colore della sezione,
// grafica all-over, fascia, nomi, numeri e aree di stampa in mm) e applicato alla mesh del modello
// 3D che corrisponde allo stesso pezzo (UV normalizzate sul riquadro del pezzo, vedi
// scripts/models/piece_uv.mjs; per le gambe di pantaloncini e pantaloni scripts/models/leg_uv.mjs,
// adattate riga per riga al contorno del pezzo con legUv). Così l'anteprima mostra le grafiche
// dove verranno stampate e cucite.

import type { AssetRef, TextStyle } from '@/types/config'
import { bounds, type PieceAnchor, type Vec } from '@/lib/patterns/geometry'
import { horizontalHits } from '@/lib/patterns/placement'
import type { Box } from '@/lib/printing'
import type { PieceJob } from '@/lib/production/plan'
import { drawFittedText } from './panel'

export type PieceCanvasKind = 'front' | 'back' | 'sleeve_left' | 'sleeve_right' | 'leg_left' | 'leg_right'
export const PIECE_CANVAS_KINDS: PieceCanvasKind[] = ['front', 'back', 'sleeve_left', 'sleeve_right', 'leg_left', 'leg_right']

/**
 * Sagome con un modello 3D preparato per la ricostruzione dai pezzi (mesh nominate per pezzo e UV
 * normalizzate): con il cartamodello del prodotto l'anteprima usa i pezzi invece della proiezione.
 */
export const PIECE_MODELS: Partial<Record<string, PieceCanvasKind[]>> = {
  tshirt: ['front', 'back'], // pezzi indispensabili; le maniche se presenti
  shorts: ['leg_left', 'leg_right'],
}
export type PieceCanvases = Partial<Record<PieceCanvasKind, HTMLCanvasElement>>
/** Contorno e riferimenti dei pezzi disegnati (per adattare le UV delle gambe). */
export type PieceShapes = Partial<Record<PieceCanvasKind, { outline: Vec[]; anchor: PieceAnchor }>>
export interface PieceSet { canvases: PieceCanvases; shapes: PieceShapes }

/**
 * UV delle gambe: da (t, s) del modello (giro attorno alla gamba dal bordo "davanti" del pezzo a
 * quello "dietro", altezza dalla vita all'orlo) alle coordinate del canvas del pezzo. Ogni riga
 * del modello copre l'intera larghezza del pezzo a quell'altezza: nessuna parte resta scoperta.
 */
export function legUv(ts: ArrayLike<number>, shape: { outline: Vec[]; anchor: PieceAnchor }): Float32Array {
  const b = bounds(shape.outline)
  const ROWS = 240
  const rows: [number, number][] = []
  for (let i = 0; i <= ROWS; i++) {
    // un soffio dentro il riquadro per avere sempre un'intersezione
    const y = b.maxY - (i / ROWS) * b.height * 0.998 - b.height * 0.001
    const xs = horizontalHits(shape.outline, y)
    rows.push(xs.length >= 2 ? [xs[0], xs[xs.length - 1]] : rows[rows.length - 1] ?? [b.minX, b.maxX])
  }
  // il bordo "davanti" del pezzo è quello del centro davanti in vita (x, y), l'altro è il dietro (bx, by)
  const frontLeft = (shape.anchor.x ?? b.minX) <= (shape.anchor.bx ?? b.maxX)
  const out = new Float32Array(ts.length)
  for (let i = 0; i < ts.length; i += 2) {
    const t = Math.min(1, Math.max(0, ts[i])), s = Math.min(1, Math.max(0, ts[i + 1]))
    const f = s * ROWS, r0 = Math.floor(f), r1 = Math.min(ROWS, r0 + 1), k = f - r0
    const xl = rows[r0][0] + (rows[r1][0] - rows[r0][0]) * k, xr = rows[r0][1] + (rows[r1][1] - rows[r0][1]) * k
    const x = frontLeft ? xl + t * (xr - xl) : xr - t * (xr - xl)
    out[i] = (x - b.minX) / b.width
    out[i + 1] = s
  }
  return out
}

/** Guide sul pezzo (cm dal riferimento): area di stampa utilizzabile e aree fisse. */
export interface PieceGuides { anchor: Vec; zone?: Box | null; fixed?: { name: string; box: Box }[] }

/**
 * Disegna il pezzo sul canvas (lato lungo `maxPx`), riempiendo l'intero riquadro: la mesh del
 * modello può uscire di poco dal contorno del cartamodello e non deve restare scoperta.
 */
export function drawPieceCanvas(
  canvas: HTMLCanvasElement, job: PieceJob, image: (a: AssetRef) => CanvasImageSource | null, textStyle: TextStyle,
  guides?: PieceGuides | null, maxPx = 1024,
) {
  const b = bounds(job.cut)
  const k = maxPx / Math.max(b.width, b.height)
  const w = Math.max(1, Math.round(b.width * k)), h = Math.max(1, Math.round(b.height * k))
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const X = (x: number) => (x - b.minX) * k
  const Y = (y: number) => (b.maxY - y) * k
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = job.fill
  ctx.fillRect(0, 0, w, h)

  const cover = (img: CanvasImageSource, x: number, y: number, cw: number, ch: number) => {
    const iw = (img as HTMLImageElement).naturalWidth || (img as HTMLCanvasElement).width || 1
    const ih = (img as HTMLImageElement).naturalHeight || (img as HTMLCanvasElement).height || 1
    const s = Math.max(cw / iw, ch / ih)
    ctx.drawImage(img, x + (cw - iw * s) / 2, y + (ch - ih * s) / 2, iw * s, ih * s)
  }
  if (job.allOver) {
    const img = image(job.allOver)
    if (img) cover(img, 0, 0, w, h)
  }
  if (job.band) {
    // fascia sul fondo del pezzo, come nel file di produzione
    const bh = job.band.heightMm * k, y0 = h - bh
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, y0, w, bh)
    ctx.clip()
    if (job.band.color) { ctx.fillStyle = job.band.color; ctx.fillRect(0, y0, w, bh) }
    else if (job.band.asset) { const img = image(job.band.asset); if (img) cover(img, 0, y0, w, bh) }
    ctx.restore()
  }
  for (const p of job.placements) {
    const pw = p.w * k, ph = p.h * k
    let img: CanvasImageSource | null = null
    if (p.kind === 'text' && p.text) {
      const t = document.createElement('canvas')
      t.width = Math.max(1, Math.round(pw))
      t.height = Math.max(1, Math.round(ph))
      drawFittedText(t.getContext('2d')!, p.text, 0, 0, t.width, t.height, p.textStyle ?? textStyle, p.textKind ?? 'text')
      img = t
    } else if (p.asset) img = image(p.asset)
    if (!img) continue
    const iw = (img as HTMLImageElement).naturalWidth || (img as HTMLCanvasElement).width || 1
    const ih = (img as HTMLImageElement).naturalHeight || (img as HTMLCanvasElement).height || 1
    const s = Math.min(pw / iw, ph / ih)
    ctx.save()
    ctx.translate(X(p.center[0]), Y(p.center[1]))
    ctx.rotate((p.rotation * Math.PI) / 180) // rotazione oraria, y verso il basso
    ctx.drawImage(img, (-iw * s) / 2, (-ih * s) / 2, iw * s, ih * s)
    ctx.restore()
  }

  if (guides) {
    const [ax, ay] = guides.anchor
    const rect = (bx: Box) => [X(ax + bx.x1 * 10), Y(ay - bx.y1 * 10), (bx.x2 - bx.x1) * 10 * k, (bx.y2 - bx.y1) * 10 * k] as const
    ctx.save()
    ctx.lineWidth = Math.max(2, w / 300)
    ctx.setLineDash([ctx.lineWidth * 4, ctx.lineWidth * 3])
    for (const f of guides.fixed ?? []) {
      const [x, y, rw, rh] = rect(f.box)
      ctx.strokeStyle = 'rgba(80,80,90,.7)'
      ctx.strokeRect(x, y, rw, rh)
      ctx.fillStyle = 'rgba(80,80,90,.8)'
      ctx.font = `600 ${Math.max(12, w / 40)}px Inter, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(f.name, x + rw / 2, y + rh / 2)
    }
    if (guides.zone) {
      const [x, y, rw, rh] = rect(guides.zone)
      ctx.strokeStyle = 'rgba(194,160,99,.95)'
      ctx.strokeRect(x, y, rw, rh)
    }
    ctx.restore()
  }
}
