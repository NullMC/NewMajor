// Fasce longitudinali (bande sportive) sui pezzi del cartamodello, in mm nelle coordinate del pezzo
// (y verso l'alto). I poligoni possono uscire dal contorno: chi disegna li ritaglia sul pezzo.
//
// - Maglie e capi superiori: la fascia parte dal colletto, dove davanti e dietro si uniscono sulla
//   cucitura della spalla, segue la spalla fino al giromanica e scende lungo la sommità della
//   manica fino al foro del braccio. Sul davanti e sul dietro c'è metà larghezza lungo la cucitura
//   della spalla (le due metà si uniscono cucendo il capo), sulla manica la larghezza intera
//   centrata sulla linea della sommità (riferimento del pezzo).
// - Pantaloncini e pantaloni con le gambe intere: la fascia corre lungo il lato esterno della
//   gamba, dalla vita all'orlo, a metà tra il bordo davanti e il bordo dietro del pezzo.

import { bounds, type Vec } from './geometry'
import { anchorOf, horizontalHits, type ZonePiece } from './placement'

type PieceShape = Pick<ZonePiece, 'outline' | 'anchor'>
const OUT = 30 // mm oltre il bordo del pezzo, coperti dall'abbondanza e poi ritagliati

/** Manica: striscia verticale centrata sulla sommità (riferimento), dalla testa al polsino. */
export function sleeveStripe(piece: PieceShape, widthMm: number): Vec[] {
  const b = bounds(piece.outline)
  const [ax] = anchorOf(piece)
  const h = widthMm / 2
  return [[ax - h, b.minY - OUT], [ax + h, b.minY - OUT], [ax + h, b.maxY + OUT], [ax - h, b.maxY + OUT]]
}

/**
 * Davanti e dietro: due strisce (una per spalla) larghe metà fascia lungo la cucitura della spalla,
 * dal colletto al giromanica. La spalla va dall'angolo del collo (il punto più alto del lato) alla
 * punta della spalla (il punto più esterno nella parte alta del pezzo, dove inizia il giromanica).
 */
export function shoulderStripes(piece: PieceShape, widthMm: number): Vec[][] {
  const b = bounds(piece.outline)
  const [ax] = anchorOf(piece)
  const half = widthMm / 2
  const out: Vec[][] = []
  for (const side of [-1, 1]) {
    const pts = piece.outline.filter(([x]) => (x - ax) * side > 0)
    if (pts.length < 2) continue
    const neck = pts.reduce((a, p) => (p[1] > a[1] ? p : a))
    const top = pts.filter(([, y]) => y >= neck[1] - b.height * 0.15)
    const tip = top.reduce((a, p) => ((p[0] - ax) * side > (a[0] - ax) * side ? p : a))
    const dx = tip[0] - neck[0], dy = tip[1] - neck[1], len = Math.hypot(dx, dy)
    if (len < 10) continue
    const d: Vec = [dx / len, dy / len]
    // normale verso l'interno del pezzo (verso il basso)
    let n: Vec = [-d[1], d[0]]
    if (n[1] > 0) n = [-n[0], -n[1]]
    // lungo la spalla si ferma alla punta (oltre comincia il giromanica: la fascia prosegue sulla
    // manica); verso l'esterno della cucitura sborda per coprire l'abbondanza
    const END = 2
    const P: Vec = [neck[0] - d[0] * END, neck[1] - d[1] * END], Q: Vec = [tip[0] + d[0] * END, tip[1] + d[1] * END]
    const at = (p: Vec, k: number): Vec => [p[0] + n[0] * k, p[1] + n[1] * k]
    out.push([at(P, -OUT), at(Q, -OUT), at(Q, half), at(P, half)])
  }
  return out
}

/** Gamba intera: striscia lungo il lato esterno (a metà del pezzo a ogni altezza), dalla vita all'orlo. */
export function legSideStripe(piece: PieceShape, widthMm: number): Vec[] {
  const b = bounds(piece.outline)
  const h = widthMm / 2
  const mids: Vec[] = []
  const STEPS = 60
  for (let i = 0; i <= STEPS; i++) {
    const y = b.maxY - (i / STEPS) * b.height * 0.999 - b.height * 0.0005
    const xs = horizontalHits(piece.outline, y)
    if (xs.length >= 2) mids.push([(xs[0] + xs[xs.length - 1]) / 2, y])
  }
  if (mids.length < 2) return []
  // prolunga oltre vita e orlo
  mids[0] = [mids[0][0], b.maxY + OUT]
  mids[mids.length - 1] = [mids[mids.length - 1][0], b.minY - OUT]
  return [...mids.map(([x, y]) => [x - h, y] as Vec), ...[...mids].reverse().map(([x, y]) => [x + h, y] as Vec)]
}

/** Fasce del pezzo indicato per un capo superiore o inferiore (vuoto se il pezzo non ne ha). */
export function bandPolygons(kind: string, piece: PieceShape, widthMm: number, bottom: boolean): Vec[][] {
  if (!(widthMm > 0)) return []
  if (bottom) return kind === 'leg_left' || kind === 'leg_right' ? [legSideStripe(piece, widthMm)].filter((p) => p.length) : []
  if (kind === 'sleeve_left' || kind === 'sleeve_right') return [sleeveStripe(piece, widthMm)]
  if (kind === 'front' || kind === 'back') return shoulderStripes(piece, widthMm)
  return []
}

/**
 * Sagome piane dei pantaloni (anteprima senza cartamodello): metà fascia lungo il bordo esterno
 * sinistro e destro del davanti o del dietro (le due metà si uniscono sul fianco).
 */
export function outerEdgeStripes(outline: Vec[], halfWidth: number): Vec[][] {
  const b = bounds(outline)
  const left: Vec[] = [], right: Vec[] = []
  const STEPS = 60
  for (let i = 0; i <= STEPS; i++) {
    const y = b.maxY - (i / STEPS) * b.height * 0.999 - b.height * 0.0005
    const xs = horizontalHits(outline, y)
    if (xs.length < 2) continue
    left.push([xs[0], y]); right.push([xs[xs.length - 1], y])
  }
  if (left.length < 2) return []
  const ext = (pts: Vec[]) => { pts[0] = [pts[0][0], b.maxY + halfWidth]; pts[pts.length - 1] = [pts[pts.length - 1][0], b.minY - halfWidth]; return pts }
  ext(left); ext(right)
  return [
    [...left.map(([x, y]) => [x - halfWidth, y] as Vec), ...[...left].reverse().map(([x, y]) => [x + halfWidth, y] as Vec)],
    [...right.map(([x, y]) => [x - halfWidth, y] as Vec), ...[...right].reverse().map(([x, y]) => [x + halfWidth, y] as Vec)],
  ]
}
