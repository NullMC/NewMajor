// Ricostruzione del capo dai pezzi del cartamodello: ogni pezzo (davanti, dietro, maniche) viene
// disegnato su un canvas esattamente come nel file di produzione (fondo o colore della sezione,
// grafica all-over, fascia, nomi, numeri e aree di stampa in mm) e applicato alla mesh del modello
// 3D che corrisponde allo stesso pezzo (UV normalizzate sul riquadro del pezzo, vedi
// scripts/models/piece_uv.mjs). Così l'anteprima mostra le grafiche dove verranno stampate e cucite.

import type { AssetRef, TextStyle } from '@/types/config'
import { bounds, type Vec } from '@/lib/patterns/geometry'
import type { Box } from '@/lib/printing'
import type { PieceJob } from '@/lib/production/plan'
import { drawFittedText } from './panel'

export type PieceCanvasKind = 'front' | 'back' | 'sleeve_left' | 'sleeve_right'
export const PIECE_CANVAS_KINDS: PieceCanvasKind[] = ['front', 'back', 'sleeve_left', 'sleeve_right']

/**
 * Sagome con un modello 3D preparato per la ricostruzione dai pezzi (mesh nominate per pezzo e UV
 * normalizzate): con il cartamodello del prodotto l'anteprima usa i pezzi invece della proiezione.
 */
export const PIECE_MODELS: Partial<Record<string, true>> = { tshirt: true }
export type PieceCanvases = Partial<Record<PieceCanvasKind, HTMLCanvasElement>>

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
