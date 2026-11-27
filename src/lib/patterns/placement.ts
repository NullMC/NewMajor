// Posizionamento di loghi e sponsor liberi sui pezzi del cartamodello.
//
// Un elemento ha il centro in cm rispetto al punto di riferimento del pezzo (x verso destra,
// y verso il basso, guardando il pezzo dall'esterno) e una larghezza in cm. Le stesse misure
// valgono per tutte le taglie: sul pezzo di ogni taglia l'elemento si colloca alla stessa
// distanza dal suo riferimento (come si fa in produzione).

import type { PlacedElement, PrintZone, SectionKey } from '@/types/config'
import { bounds, pointInPolygon, type PieceAnchor, type Vec } from './geometry'
import { heightOf, type Box } from '@/lib/printing'

export interface ZonePiece {
  kitItemId: string | null
  zone: SectionKey
  size: string
  name: string
  outline: Vec[]
  anchor: PieceAnchor
  /** Pezzo indicativo (capo senza cartamodello): solo anteprima, non per la produzione. */
  virtual?: boolean
}

export const ZONE_LABEL: Record<PrintZone, string> = {
  front: 'Davanti',
  back: 'Dietro',
  sleeve_left: 'Manica sinistra',
  sleeve_right: 'Manica destra',
}

/** Sezioni del capo (all-over): le zone più le gambe del pantaloncino. */
export const SECTION_LABEL: Record<SectionKey, string> = {
  ...ZONE_LABEL,
  leg_left: 'Gamba sinistra',
  leg_right: 'Gamba destra',
}

/** Altezza dell'elemento in cm: quella indicata, altrimenti dal rapporto dell'immagine (1:1 se ignoto). */
export function elementHeightCm(el: Pick<PlacedElement, 'widthCm' | 'heightCm' | 'asset'>): number {
  return heightOf(el)
}

/** Riferimento del pezzo; per le gambe `side` sceglie il centro davanti (default) o dietro. */
export function anchorOf(piece: Pick<ZonePiece, 'anchor' | 'outline'>, side: 'front' | 'back' = 'front'): Vec {
  if (side === 'back' && piece.anchor?.bx != null && piece.anchor?.by != null) return [piece.anchor.bx, piece.anchor.by]
  if (piece.anchor?.x != null && piece.anchor?.y != null) return [piece.anchor.x, piece.anchor.y]
  const b = bounds(piece.outline)
  return [b.minX + b.width / 2, b.maxY]
}

/** Centro dell'elemento nelle coordinate del pezzo (mm, y verso l'alto). */
export function elementCenterMm(el: Pick<PlacedElement, 'xCm' | 'yCm'>, piece: Pick<ZonePiece, 'anchor' | 'outline'>, side: 'front' | 'back' = 'front'): Vec {
  const [ax, ay] = anchorOf(piece, side)
  return [ax + el.xCm * 10, ay - el.yCm * 10]
}

/** Vertici del rettangolo dell'elemento (ruotato) nelle coordinate del pezzo, in mm. */
export function elementCornersMm(el: PlacedElement, piece: Pick<ZonePiece, 'anchor' | 'outline'>): Vec[] {
  const [cx, cy] = elementCenterMm(el, piece)
  const hw = (el.widthCm * 10) / 2, hh = (elementHeightCm(el) * 10) / 2
  const r = (-(el.rotation || 0) * Math.PI) / 180 // y verso l'alto: la rotazione oraria è negativa
  const c = Math.cos(r), s = Math.sin(r)
  return ([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]] as Vec[]).map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c])
}

/**
 * Controllo di posizione: l'elemento deve stare dentro il pezzo, a una distanza minima dal
 * bordo di taglio (margine di sicurezza per cuciture e tolleranze di taglio).
 */
export function placementIssue(el: PlacedElement, piece: ZonePiece, marginMm = 15): 'outside' | 'near_edge' | null {
  const corners = elementCornersMm(el, piece)
  // campiona anche i lati del rettangolo
  const samples: Vec[] = []
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = corners[i], [x2, y2] = corners[(i + 1) % 4]
    for (let t = 0; t < 1; t += 0.125) samples.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t])
  }
  if (samples.some((p) => !pointInPolygon(p, piece.outline))) return 'outside'
  const minDist = Math.min(...samples.map((p) => distanceToOutline(p, piece.outline)))
  return minDist < marginMm ? 'near_edge' : null
}

export function distanceToOutline([x, y]: Vec, pts: Vec[]): number {
  let best = Infinity
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [x1, y1] = pts[j], [x2, y2] = pts[i]
    const dx = x2 - x1, dy = y2 - y1
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1)))
    best = Math.min(best, Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)))
  }
  return best
}

/** DPI effettivi dell'immagine alla larghezza di stampa (null per i vettoriali). */
export function elementDpi(el: Pick<PlacedElement, 'widthCm' | 'asset'>): number | null {
  if (!el.asset || el.asset.isVector || !el.asset.width) return null
  return Math.round(el.asset.width / (el.widthCm / 2.54))
}

/** Pezzo della zona per il componente indicato (o per il capo principale). */
export function zonePiece(zones: ZonePiece[], zone: SectionKey, kitItemId: string | null): ZonePiece | null {
  return zones.find((z) => z.zone === zone && (z.kitItemId ?? null) === (kitItemId ?? null)) ?? null
}

/** Ascisse in cui la retta orizzontale y attraversa il contorno, ordinate. */
function horizontalHits(pts: Vec[], y: number): number[] {
  const xs: number[] = []
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [x1, y1] = pts[j], [x2, y2] = pts[i]
    if ((y1 > y) !== (y2 > y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1))
  }
  return xs.sort((a, b) => a - b)
}

/**
 * Il rettangolo, centrato sull'asse del pezzo, che copre il busto dal petto all'orlo (sotto la scollatura,
 * tra i giromanica, sopra l'orlo) a `marginCm` dal taglio: l'area di stampa "tutto il pezzo".
 * In cm dal riferimento, x a destra e y in basso, arrotondato al mezzo centimetro.
 */
export function largestTorsoBox(piece: Pick<ZonePiece, 'outline' | 'anchor'>, marginCm = 2): Box | null {
  const [ax, ay] = anchorOf(piece)
  const b = bounds(piece.outline)
  const m = marginCm * 10, step = 5
  const rows: { y: number; hw: number }[] = []
  // solo sotto il riferimento (centro collo): esclude il cappuccio delle sagome
  for (let y = Math.min(b.maxY, ay) - step / 2; y > b.minY; y -= step) {
    const xs = horizontalHits(piece.outline, y)
    let hw = -1
    for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i] <= ax && ax <= xs[i + 1]) hw = Math.min(ax - xs[i], xs[i + 1] - ax)
    rows.push({ y, hw })
  }
  // larghezza del busto all'orlo: limita le sagome con le braccia staccate dal corpo
  const hem = rows.filter((r) => r.y < b.minY + b.height * 0.12 && r.hw > 0)
  const cap = hem.length ? Math.max(...hem.map((r) => r.hw)) : Infinity
  // dall'alto verso l'orlo: si parte dalla prima riga sotto lo scollo in cui il busto è largo almeno
  // il 75% della sua larghezza (sul dietro salta la pendenza delle spalle) e si arriva all'orlo; il
  // petto resta sempre compreso, la larghezza è la minima del tratto (giromanica)
  const width = (r: { hw: number }) => Math.min(r.hw, cap)
  const valid = rows.filter((r) => r.hw > m)
  if (!valid.length) return null
  const full = Math.max(...valid.map(width))
  const i0 = rows.findIndex((r) => r.hw > m && width(r) >= full * 0.75)
  // in basso si ferma dove il busto si restringe sotto la stessa soglia (orli arrotondati delle sagome)
  let j = i0
  while (j + 1 < rows.length && rows[j + 1].hw > m && width(rows[j + 1]) >= full * 0.75) j++
  const hw = Math.min(...rows.slice(i0, j + 1).map(width))
  const best = { top: rows[i0].y + step / 2 - m, bottom: rows[j].y - step / 2 + m, hw: hw - m }
  if (best.top <= best.bottom || best.hw <= 0) return null
  const half = (v: number) => Math.floor(v * 2) / 2
  const halfW = half(best.hw / 10)
  return { x1: -halfW, x2: halfW, y1: Math.ceil(((ay - best.top) / 10) * 2) / 2, y2: half((ay - best.bottom) / 10) }
}
