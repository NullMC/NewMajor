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
import { bandPolygons } from '@/lib/patterns/bands'
import type { ModelPiece } from './pieceModels'
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
/** Intervallo [sinistra, destra] (mm) del pezzo a ogni riga, dall'alto (riga 0) al basso (riga ROWS). */
function outlineRows(outline: Vec[], ROWS: number): [number, number][] {
  const b = bounds(outline)
  const rows: [number, number][] = []
  for (let i = 0; i <= ROWS; i++) {
    // un soffio dentro il riquadro per avere sempre un'intersezione
    const y = b.maxY - (i / ROWS) * b.height * 0.998 - b.height * 0.001
    const xs = horizontalHits(outline, y)
    rows.push(xs.length >= 2 ? [xs[0], xs[xs.length - 1]] : rows[rows.length - 1] ?? [b.minX, b.maxX])
  }
  return rows
}

/** Interpolazione di una tabella di righe alla quota v (0 in alto, 1 in basso). */
function rowAt(rows: [number, number][], v: number): [number, number] {
  const R = rows.length - 1
  const f = Math.min(1, Math.max(0, v)) * R, r0 = Math.floor(f), r1 = Math.min(R, r0 + 1), k = f - r0
  return [rows[r0][0] + (rows[r1][0] - rows[r0][0]) * k, rows[r0][1] + (rows[r1][1] - rows[r0][1]) * k]
}

/**
 * Pezzi del busto e maniche: le UV del modello (u, v normalizzate sul suo pezzo) vengono adattate
 * riga per riga al pezzo del prodotto. A ogni altezza la larghezza del pezzo del modello (`srcRows`,
 * salvata nel GLB da piece_uv.mjs) corrisponde alla larghezza del pezzo del cartamodello: spalle,
 * giromanica e fianchi coincidono, e le fasce o le grafiche vicino ai bordi cadono al posto giusto.
 */
export function rowFitUv(uvs: ArrayLike<number>, srcRows: [number, number][], shape: { outline: Vec[] }): Float32Array {
  const b = bounds(shape.outline)
  const dst = outlineRows(shape.outline, 240)
  // righe degeneri (un solo punto, agli estremi): si usa la riga valida più vicina
  const src = srcRows.map((r) => [r[0], r[1]] as [number, number])
  for (let i = 0; i < src.length; i++) {
    if (src[i][1] - src[i][0] >= 0.02) continue
    for (let k = 1; k < src.length; k++) {
      const n = src[i + k] && src[i + k][1] - src[i + k][0] >= 0.02 ? src[i + k] : src[i - k] && src[i - k][1] - src[i - k][0] >= 0.02 ? src[i - k] : null
      if (n) { src[i] = [n[0], n[1]]; break }
    }
  }
  const out = new Float32Array(uvs.length)
  for (let i = 0; i < uvs.length; i += 2) {
    const u = uvs[i], v = uvs[i + 1]
    // righe cercate appena dentro il pezzo (agli estremi orli curvi e punte danno righe di un punto)
    const vr = Math.min(0.99, Math.max(0.01, v))
    const [sl, sr] = rowAt(src, vr)
    const [dl, dr] = rowAt(dst, vr)
    const t = Math.min(1.05, Math.max(-0.05, (u - sl) / Math.max(1e-4, sr - sl)))
    out[i] = (dl + t * (dr - dl) - b.minX) / b.width
    out[i + 1] = v
  }
  return out
}

export function legUv(ts: ArrayLike<number>, shape: { outline: Vec[]; anchor: PieceAnchor }): Float32Array {
  const b = bounds(shape.outline)
  const ROWS = 240
  const rows = outlineRows(shape.outline, ROWS)
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
    // fasce longitudinali come nel file di produzione (spalla e manica, lato della gamba)
    for (const poly of job.band.polys) {
      ctx.save()
      ctx.beginPath()
      poly.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))))
      ctx.closePath()
      ctx.clip()
      if (job.band.color) { ctx.fillStyle = job.band.color; ctx.fillRect(0, 0, w, h) }
      else if (job.band.asset) {
        const img = image(job.band.asset)
        const pb = bounds(poly)
        if (img) cover(img, X(pb.minX), Y(pb.maxY), pb.width * k, pb.height * k)
      }
      ctx.restore()
    }
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

/**
 * Fasce per l'anteprima 3D: calcolate sul pezzo del modello (le sue cuciture di spalla e giromanica
 * possono essere diverse da quelle del cartamodello, es. spalla scesa) e riportate sul pezzo del
 * prodotto con lo stesso adattamento riga per riga delle UV. Così sul modello la fascia segue la
 * cucitura della spalla e la sommità della manica; nel file di produzione resta quella del
 * cartamodello.
 */
export function modelBandPolys(kind: string, model: ModelPiece, shape: { outline: Vec[] }, widthMm: number): Vec[][] {
  const [W, H] = model.mm
  const mOutline: Vec[] = model.outline.map(([u, v]) => [u * W, (1 - v) * H])
  const top = mOutline.reduce((a, p) => (p[1] > a[1] ? p : a))
  const ax = kind === 'sleeve_left' || kind === 'sleeve_right' ? top[0] : W / 2
  const polys = bandPolygons(kind, { outline: mOutline, anchor: { x: ax, y: H } }, widthMm, false)
  const src = outlineRows(mOutline, 240)
  const dst = outlineRows(shape.outline, 240)
  const b = bounds(shape.outline)
  const scale = b.width / W
  return polys.map((poly) => poly.map(([x, y]) => {
    const v = (H - y) / H
    // righe cercate un po' dentro il pezzo: agli estremi un orlo curvo o una punta danno righe di un solo punto
    const vr = Math.min(0.97, Math.max(0.03, v))
    const [sl, sr] = rowAt(src, vr), [dl, dr] = rowAt(dst, vr)
    // righe molto strette (testa della manica, punte): distanza dal centro con la scala del pezzo,
    // altrimenti la posizione in proporzione alla larghezza della riga
    const X = sr - sl >= 60
      ? dl + ((x - sl) / (sr - sl)) * (dr - dl)
      : (dl + dr) / 2 + (x - (sl + sr) / 2) * scale
    return [X, b.maxY - v * b.height] as Vec
  }))
}
