import * as THREE from 'three'
import { distanceToPolygon, pointInPolygon, type GarmentShape } from './shapes'

export const TARGET_WIDTH = 2.2

/**
 * Superficie a "cuscino" di un pannello: la profondità cresce con la distanza dal bordo.
 * `drape` aggiunge pieghe morbide del tessuto (0 = superficie liscia).
 */
export function buildPanelGeometry(shape: GarmentShape, side: 'front' | 'back', segX = 96, drape = 0) {
  const { minX, maxX, minY, maxY } = shape.bounds
  const W = maxX - minX
  const H = maxY - minY
  const segY = Math.round((segX * H) / W)
  const geo = new THREE.PlaneGeometry(W, H, segX, segY)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const poly = side === 'front' ? shape.front : shape.back
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const R = W * 0.17
  const B = W * shape.bulge
  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i) + cx
    const sy = pos.getY(i) + cy
    let z = 0
    if (pointInPolygon(sx, sy, poly)) {
      const t = Math.min(distanceToPolygon(sx, sy, poly) / R, 1)
      z = B * Math.sqrt(1 - (1 - t) * (1 - t))
      if (drape) {
        // Pieghe verticali che si attenuano verso le spalle, più qualche increspatura sui fianchi
        const fall = Math.max(0, 1 - (sy - minY) / H)
        z += drape * t * (Math.sin(sx * 0.21 + sy * 0.035) * 0.6 * fall + Math.sin(sx * 0.47 - sy * 0.09) * 0.25 + Math.sin(sy * 0.3 + sx * 0.05) * 0.15)
      }
    }
    pos.setZ(i, z)
  }
  geo.computeVertexNormals()
  const s = TARGET_WIDTH / W
  geo.scale(s, s, s)
  return geo
}
