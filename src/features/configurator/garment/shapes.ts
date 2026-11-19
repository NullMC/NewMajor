// Sagome dei capi (vista frontale), in unità arbitrarie con y verso l'alto.
// La stessa sagoma genera la mesh 3D, la maschera della texture e le anteprime 2D,
// così le aree di personalizzazione (in % del riquadro) coincidono ovunque.

import type { ModelShape } from '@/types/db'

export type Pt = [number, number]

class PathBuilder {
  pts: Pt[] = []
  private cur: Pt = [0, 0]
  move(x: number, y: number) { this.cur = [x, y]; this.pts.push([x, y]); return this }
  line(x: number, y: number) { this.cur = [x, y]; this.pts.push([x, y]); return this }
  quad(cx: number, cy: number, x: number, y: number, steps = 14) {
    const [x0, y0] = this.cur
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t
      this.pts.push([a * x0 + b * cx + c * x, a * y0 + b * cy + c * y])
    }
    this.cur = [x, y]
    return this
  }
}

/** Costruisce una sagoma simmetrica a partire dal lato destro (da orlo a centro collo). */
function mirrorRight(right: Pt[]): Pt[] {
  const left = right.slice(0, -1).reverse().map(([x, y]) => [-x, y] as Pt)
  const pts = [...right, ...left.slice(0)]
  // chiude togliendo il duplicato al centro
  return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1])
}

export interface GarmentShape {
  front: Pt[]
  back: Pt[]
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
  /** Linee da evidenziare con il colore secondario (collo, orli manica). */
  trims: { front: Pt[][]; back: Pt[][] }
  /** Spessore relativo del "cuscino" 3D. */
  bulge: number
}

function tshirt(longSleeve: boolean, neckDepth: number): { outline: Pt[]; trims: Pt[][] } {
  const b = new PathBuilder().move(27, 0).quad(30, 26, 29, 50)
  let cuff: Pt[]
  if (longSleeve) {
    b.line(50, 6).line(60, 11)
    cuff = [[50, 6], [60, 11]]
    b.quad(46, 52, 19, 74)
  } else {
    b.line(46, 43).line(52, 55)
    cuff = [[46, 43], [52, 55]]
    b.quad(34, 66, 19, 74)
  }
  b.line(9.5, 76.5).quad(8, 76.5 - neckDepth, 0, 76.5 - neckDepth)
  const right = b.pts
  const neckStart = right.findIndex(([x, y]) => x === 9.5 && y === 76.5)
  const neckRight = right.slice(neckStart)
  const neck = [...neckRight, ...neckRight.slice(0, -1).reverse().map(([x, y]) => [-x, y] as Pt)]
  return {
    outline: mirrorRight(right),
    trims: [neck, cuff, cuff.map(([x, y]) => [-x, y] as Pt)],
  }
}

function tank(neckDepth: number): { outline: Pt[]; trims: Pt[][] } {
  const b = new PathBuilder().move(26, 0).quad(29, 26, 27, 50).quad(15, 54, 14, 76).line(8, 76).quad(7, 76 - neckDepth, 0, 76 - neckDepth)
  const right = b.pts
  const armStart = right.findIndex(([x, y]) => x === 27 && y === 50)
  const arm = right.slice(armStart, right.findIndex(([x, y]) => x === 14 && y === 76) + 1)
  const neckStart = right.findIndex(([x, y]) => x === 8 && y === 76)
  const neckRight = right.slice(neckStart)
  const neck = [...neckRight, ...neckRight.slice(0, -1).reverse().map(([x, y]) => [-x, y] as Pt)]
  return { outline: mirrorRight(right), trims: [neck, arm, arm.map(([x, y]) => [-x, y] as Pt)] }
}

function shorts(): { outline: Pt[]; trims: Pt[][] } {
  const pts: Pt[] = [
    [-30, 42], [30, 42], [31, 34], [35, 2], [4, 0], [1.5, 13], [0, 15], [-1.5, 13], [-4, 0], [-35, 2], [-31, 34],
  ]
  return { outline: pts, trims: [[[-30, 39.5], [30, 39.5]], [[35, 3.5], [4, 1.5]], [[-35, 3.5], [-4, 1.5]]] }
}

const cache = new Map<ModelShape, GarmentShape>()

export function getShape(kind: ModelShape): GarmentShape {
  const hit = cache.get(kind)
  if (hit) return hit
  let front: { outline: Pt[]; trims: Pt[][] }
  let back: { outline: Pt[]; trims: Pt[][] }
  let bulge = 0.1
  switch (kind) {
    case 'longsleeve':
      front = tshirt(true, 8); back = tshirt(true, 2.5); break
    case 'tank':
      front = tank(14); back = tank(6); break
    case 'shorts':
      front = shorts(); back = shorts(); bulge = 0.08; break
    default:
      front = tshirt(false, 8); back = tshirt(false, 2.5)
  }
  const all = [...front.outline, ...back.outline]
  const bounds = {
    minX: Math.min(...all.map((p) => p[0])),
    maxX: Math.max(...all.map((p) => p[0])),
    minY: Math.min(...all.map((p) => p[1])),
    maxY: Math.max(...all.map((p) => p[1])),
  }
  const shape: GarmentShape = {
    front: front.outline, back: back.outline, bounds, bulge,
    trims: { front: front.trims, back: back.trims },
  }
  cache.set(kind, shape)
  return shape
}

/** Converte un punto della sagoma in coordinate canvas (y verso il basso). */
export function toCanvas(p: Pt, b: GarmentShape['bounds'], w: number, h: number): Pt {
  return [((p[0] - b.minX) / (b.maxX - b.minX)) * w, ((b.maxY - p[1]) / (b.maxY - b.minY)) * h]
}

export function pointInPolygon(x: number, y: number, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function distanceToPolygon(x: number, y: number, poly: Pt[]): number {
  let min = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [x1, y1] = poly[j]
    const [x2, y2] = poly[i]
    const dx = x2 - x1, dy = y2 - y1
    const len = dx * dx + dy * dy
    const t = len ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len)) : 0
    const px = x1 + t * dx - x, py = y1 + t * dy - y
    const d = px * px + py * py
    if (d < min) min = d
  }
  return Math.sqrt(min)
}

export const SHAPE_LABEL: Record<ModelShape, string> = {
  tshirt: 'Maglia manica corta',
  longsleeve: 'Maglia manica lunga',
  tank: 'Canotta',
  shorts: 'Pantaloncino',
}
