// Posizionamento di loghi e sponsor liberi sui pezzi del cartamodello.
//
// Un elemento ha il centro in cm rispetto al punto di riferimento del pezzo (x verso destra,
// y verso il basso, guardando il pezzo dall'esterno) e una larghezza in cm. Le stesse misure
// valgono per tutte le taglie: sul pezzo di ogni taglia l'elemento si colloca alla stessa
// distanza dal suo riferimento (come si fa in produzione).

import type { PlacedElement, PrintZone } from '@/types/config'
import { bounds, pointInPolygon, type Vec } from './geometry'

export interface ZonePiece {
  kitItemId: string | null
  zone: PrintZone
  size: string
  name: string
  outline: Vec[]
  anchor: { x?: number; y?: number }
}

export const ZONE_LABEL: Record<PrintZone, string> = {
  front: 'Davanti',
  back: 'Dietro',
  sleeve_left: 'Manica sinistra',
  sleeve_right: 'Manica destra',
}

/** Altezza dell'elemento in cm, dal rapporto dell'immagine (1:1 se ignoto). */
export function elementHeightCm(el: Pick<PlacedElement, 'widthCm' | 'asset'>): number {
  const { width, height } = el.asset
  return width > 0 && height > 0 ? (el.widthCm * height) / width : el.widthCm
}

export function anchorOf(piece: Pick<ZonePiece, 'anchor' | 'outline'>): Vec {
  if (piece.anchor?.x != null && piece.anchor?.y != null) return [piece.anchor.x, piece.anchor.y]
  const b = bounds(piece.outline)
  return [b.minX + b.width / 2, b.maxY]
}

/** Centro dell'elemento nelle coordinate del pezzo (mm, y verso l'alto). */
export function elementCenterMm(el: Pick<PlacedElement, 'xCm' | 'yCm'>, piece: Pick<ZonePiece, 'anchor' | 'outline'>): Vec {
  const [ax, ay] = anchorOf(piece)
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
  if (el.asset.isVector || !el.asset.width) return null
  return Math.round(el.asset.width / (el.widthCm / 2.54))
}

/** Pezzo della zona per il componente indicato (o per il capo principale). */
export function zonePiece(zones: ZonePiece[], zone: PrintZone, kitItemId: string | null): ZonePiece | null {
  return zones.find((z) => z.zone === zone && (z.kitItemId ?? null) === (kitItemId ?? null)) ?? null
}
