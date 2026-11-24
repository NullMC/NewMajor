// Conversione degli elementi liberi (in cm sul pezzo del cartamodello) nelle coordinate della
// sagoma usata dall'anteprima 2D/3D. È un'approssimazione per la visualizzazione: il punto di
// riferimento del pezzo coincide con il centro collo della sagoma e la scala deriva dalla
// larghezza all'orlo. Il file di produzione usa invece le misure esatte del pezzo.

import type { ModelShape } from '@/types/db'
import type { PlacedElement } from '@/types/config'
import { anchorOf, elementCenterMm, elementHeightCm, type ZonePiece } from '@/lib/patterns/placement'
import { bounds, type Vec } from '@/lib/patterns/geometry'
import { getShape } from './shapes'

/** Larghezza del poligono alla quota y (distanza tra la prima e l'ultima intersezione). */
function widthAt(pts: Vec[] | [number, number][], y: number): number {
  const xs: number[] = []
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [x1, y1] = pts[j], [x2, y2] = pts[i]
    if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1))
  }
  return xs.length >= 2 ? Math.max(...xs) - Math.min(...xs) : 0
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

/** Elementi di davanti/dietro convertiti in unità della sagoma per il pannello indicato. */
export function toSilhouette(
  shape: ModelShape,
  side: 'front' | 'back',
  elements: PlacedElement[],
  piece: ZonePiece | null,
  images: Record<string, CanvasImageSource>,
): SilhouetteElement[] {
  if (!piece) return []
  const s = getShape(shape)
  const outline = (side === 'front' ? s.front : s.back) as [number, number][]
  const sb = s.bounds
  const pb = bounds(piece.outline)
  const silHem = widthAt(outline, sb.minY + (sb.maxY - sb.minY) * 0.02)
  const pieceHem = widthAt(piece.outline, pb.minY + pb.height * 0.02)
  const k = silHem > 0 && pieceHem > 0 ? silHem / pieceHem : 0 // unità sagoma per mm
  if (!k) return []
  const n = neckY(outline)
  const [ax, ay] = anchorOf(piece)
  return elements
    .filter((e) => e.zone === side && images[e.id])
    .map((e) => {
      const [px, py] = elementCenterMm(e, piece)
      return { image: images[e.id], cx: (px - ax) * k, cy: n + (py - ay) * k, w: e.widthCm * 10 * k, h: elementHeightCm(e) * 10 * k, rotation: e.rotation || 0 }
    })
}
