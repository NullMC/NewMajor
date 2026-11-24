// Abbondanza di stampa: il contorno di taglio allargato di `mm` millimetri (giunti arrotondati),
// calcolato con Clipper per evitare auto-intersezioni nelle zone concave (giromanica, scollo).

import ClipperLib from 'clipper-lib'
import { cleanOutline, type Vec } from '@/lib/patterns/geometry'

const SCALE = 1000 // Clipper lavora con interi: 1 unità = 1 µm

export function offsetOutline(pts: Vec[], mm: number): Vec[] {
  if (!mm) return pts
  const path = pts.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }))
  const co = new ClipperLib.ClipperOffset(2, 0.05 * SCALE)
  co.AddPath(path, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon)
  const out: { X: number; Y: number }[][] = []
  co.Execute(out, mm * SCALE)
  if (!out.length) return pts
  // il contorno esterno è il più grande
  const best = out.reduce((a, b) => (Math.abs(ClipperLib.Clipper.Area(b)) > Math.abs(ClipperLib.Clipper.Area(a)) ? b : a))
  return cleanOutline(best.map((p) => [p.X / SCALE, p.Y / SCALE] as Vec))
}
