// Geometria dei pezzi di cartamodello: poligoni in millimetri, y verso l'alto.

export type Vec = [number, number]
export type PieceKind = 'front' | 'back' | 'sleeve_left' | 'sleeve_right' | 'leg_left' | 'leg_right' | 'collar' | 'cuff' | 'other'

/**
 * Punto di riferimento del pezzo (mm). Per le gambe del pantaloncino (davanti e dietro uniti sulla
 * cucitura laterale) x, y è il centro davanti in vita e bx, by il centro dietro in vita.
 */
export interface PieceAnchor { x?: number; y?: number; bx?: number; by?: number }

export const PIECE_LABEL: Record<PieceKind, string> = {
  front: 'Davanti',
  back: 'Dietro',
  sleeve_left: 'Manica sinistra',
  sleeve_right: 'Manica destra',
  leg_left: 'Gamba sinistra',
  leg_right: 'Gamba destra',
  collar: 'Collo',
  cuff: 'Polsino',
  other: 'Altro',
}

export interface Bounds { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number }

export function bounds(pts: Vec[]): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of pts) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

/** Area con segno (positiva = antiorario). */
export function signedArea(pts: Vec[]): number {
  let a = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1])
  return a / 2
}

/** Pulisce il contorno: niente punti doppi consecutivi né punto di chiusura ripetuto, verso antiorario. */
export function cleanOutline(pts: Vec[], eps = 0.01): Vec[] {
  const out: Vec[] = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > eps) out.push([p[0], p[1]])
  }
  if (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= eps) out.pop()
  return signedArea(out) < 0 ? out.reverse() : out
}

/** Sposta il pezzo in modo che il suo riquadro parta da (0, 0). */
export function normalizeOrigin(pts: Vec[]): Vec[] {
  const b = bounds(pts)
  return pts.map(([x, y]) => [round(x - b.minX), round(y - b.minY)])
}

export function mirrorX(pts: Vec[]): Vec[] {
  const b = bounds(pts)
  return cleanOutline(pts.map(([x, y]) => [round(b.maxX + b.minX - x), y]))
}

export function scale(pts: Vec[], k: number): Vec[] {
  return pts.map(([x, y]) => [x * k, y * k])
}

export const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d

/** Semplificazione Douglas-Peucker: toglie i punti che si discostano meno di `tol` (mm). */
export function simplify(pts: Vec[], tol: number): Vec[] {
  if (pts.length < 3) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [ax, ay] = pts[a], [bx, by] = pts[b]
    const dx = bx - ax, dy = by - ay
    const len = Math.hypot(dx, dy)
    let best = -1, bestD = tol
    for (let i = a + 1; i < b; i++) {
      // estremi coincidenti (contorno chiuso che torna al punto di partenza): distanza dal punto
      const d = len > 1e-9
        ? Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len
        : Math.hypot(pts[i][0] - ax, pts[i][1] - ay)
      if (d > bestD) { bestD = d; best = i }
    }
    if (best > 0) { keep[best] = 1; stack.push([a, best], [best, b]) }
  }
  return pts.filter((_, i) => keep[i])
}

/** Area (positiva) del poligono in mm². */
export const polygonArea = (pts: Vec[]) => Math.abs(signedArea(pts))

/** Arco di una polilinea DXF (bulge = tan(angolo/4)) campionato in punti, estremo iniziale escluso. */
export function bulgeArc(a: Vec, b: Vec, bulge: number, maxSegDeg = 6): Vec[] {
  if (!bulge) return [b]
  const theta = 4 * Math.atan(bulge)
  const chord = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (chord === 0) return [b]
  const r = chord / (2 * Math.sin(theta / 2))
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
  const d = Math.sqrt(Math.max(0, r * r - (chord / 2) ** 2))
  const nx = -(b[1] - a[1]) / chord, ny = (b[0] - a[0]) / chord
  const s = Math.sign(bulge) * (Math.abs(theta) > Math.PI ? -1 : 1)
  const cx = mx + nx * d * s, cy = my + ny * d * s
  const a0 = Math.atan2(a[1] - cy, a[0] - cx)
  const steps = Math.max(2, Math.ceil(Math.abs(theta) / ((maxSegDeg * Math.PI) / 180)))
  const out: Vec[] = []
  for (let i = 1; i <= steps; i++) {
    const t = a0 + (theta * i) / steps
    out.push([cx + Math.abs(r) * Math.cos(t), cy + Math.abs(r) * Math.sin(t)])
  }
  out[out.length - 1] = [b[0], b[1]]
  return out
}

/** Intersezioni del contorno con la verticale x = cx (valori di y). */
function verticalHits(pts: Vec[], cx: number): number[] {
  const ys: number[] = []
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [x1, y1] = pts[j], [x2, y2] = pts[i]
    if ((x1 <= cx && x2 > cx) || (x2 <= cx && x1 > cx)) ys.push(y1 + ((cx - x1) / (x2 - x1)) * (y2 - y1))
  }
  return ys
}

/**
 * Punto di riferimento proposto in automatico:
 * - davanti/dietro: centro del collo, cioè il bordo superiore del pezzo sull'asse centrale;
 * - maniche: il punto più alto della testa della manica;
 * - gambe: l'angolo in vita più basso (centro davanti, vedi legAnchors);
 * - altri pezzi: centro del bordo superiore.
 */
export function autoAnchor(pts: Vec[], kind: PieceKind): Vec {
  const b = bounds(pts)
  if (kind === 'sleeve_left' || kind === 'sleeve_right') {
    let top = pts[0]
    for (const p of pts) if (p[1] > top[1]) top = p
    return [round(top[0]), round(top[1])]
  }
  if (kind === 'leg_left' || kind === 'leg_right') return legAnchors(pts).front
  const cx = b.minX + b.width / 2
  const hits = verticalHits(pts, cx)
  return [round(cx), round(hits.length ? Math.max(...hits) : b.maxY)]
}

/**
 * Riferimenti di una gamba del pantaloncino: i due angoli del bordo in vita (il punto più alto e più
 * esterno di ciascuna metà del pezzo). Il centro dietro sale più del davanti (cavallo alto), quindi l'angolo
 * più basso è il centro davanti.
 */
export function legAnchors(pts: Vec[]): { front: Vec; back: Vec } {
  const b = bounds(pts)
  const cx = b.minX + b.width / 2
  const topOf = (side: -1 | 1) => {
    let best: Vec | null = null
    // il più alto, preferendo i punti verso l'esterno: l'angolo in vita, non il centro del bordo
    const score = (p: Vec) => p[1] + 0.5 * Math.abs(p[0] - cx)
    for (const p of pts) if ((p[0] - cx) * side >= 0 && (!best || score(p) > score(best))) best = p
    return best ?? [cx, b.maxY]
  }
  const l = topOf(-1), r = topOf(1)
  const [front, back] = l[1] <= r[1] ? [l, r] : [r, l]
  return { front: [round(front[0]), round(front[1])], back: [round(back[0]), round(back[1])] }
}

/** Riferimento proposto per il tipo di pezzo (con il centro dietro per le gambe). */
export function defaultAnchor(pts: Vec[], kind: PieceKind): PieceAnchor {
  if (kind === 'leg_left' || kind === 'leg_right') {
    const { front, back } = legAnchors(pts)
    return { x: front[0], y: front[1], bx: back[0], by: back[1] }
  }
  const [x, y] = autoAnchor(pts, kind)
  return { x, y }
}

/** Tipo di pezzo dedotto dal nome (italiano o inglese). */
export function guessKind(name: string): PieceKind {
  const n = name.toLowerCase()
  if (/(sleeve|manica|maniche)/.test(n)) return /(right|destr|\bdx\b|\br\b)/.test(n) ? 'sleeve_right' : 'sleeve_left'
  if (/(leg|gamba|pantalonc|short)/.test(n)) return /(right|destr|\bdx\b|\br\b)/.test(n) ? 'leg_right' : 'leg_left'
  if (/(cuff|polsin)/.test(n)) return 'cuff'
  if (/(collar|collo|collett|neck|rib|scollo)/.test(n)) return 'collar'
  if (/(back|dietro|retro|posterior|schiena)/.test(n)) return 'back'
  if (/(front|davanti|anterior|petto)/.test(n)) return 'front'
  return 'other'
}

export function pointInPolygon([x, y]: Vec, pts: Vec[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Percorso SVG del contorno (y invertita per la visualizzazione). */
export function outlinePath(pts: Vec[], b = bounds(pts)): string {
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${round(x - b.minX, 1)} ${round(b.maxY - y, 1)}`).join('') + 'Z'
}
