// Volume 3D di una maglia a partire dalla sagoma del render (canale alpha).
//
// Fronte e retro sono due superfici che si incontrano sul contorno: lo spessore cresce
// con la distanza dal bordo, come una maglia indossata da un manichino invisibile.
// Il busto è più pieno, le maniche più sottili, i bordi si arrotondano senza fessure.

import * as THREE from 'three'

export interface AlphaMap { data: Uint8ClampedArray; width: number; height: number }

/** Altezza (locale) del bordo superiore della maglia rispetto al gancio sull'asta. */
export const NECK_Y = -0.3

/** Distanza (in pixel) dal bordo della sagoma, trasformata chamfer 3-4. */
function distanceField(a: AlphaMap) {
  const { width: w, height: h } = a
  const d = new Float32Array(w * h)
  const INF = 1e9
  for (let i = 0; i < w * h; i++) d[i] = a.data[i * 4 + 3] > 127 ? INF : 0
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x])
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    if (!d[i]) continue
    d[i] = Math.min(d[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4)
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x
    if (!d[i]) continue
    d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4)
  }
  for (let i = 0; i < w * h; i++) d[i] /= 3
  return d
}

export interface JerseyVolume {
  front: THREE.BufferGeometry
  back: THREE.BufferGeometry
  width: number
  height: number
  /** Profilo delle spalle: y del bordo superiore per x (coordinate locali). */
  shoulder: (x: number) => number
}

export function buildVolume(alpha: AlphaMap, width: number, segX = 128): JerseyVolume {
  const height = width * (alpha.height / alpha.width)
  const segY = Math.round(segX * (height / width))
  const dist = distanceField(alpha)
  const pxToWorld = width / alpha.width
  const sample = (u: number, v: number) => {
    const x = Math.min(alpha.width - 1, Math.max(0, Math.round(u * (alpha.width - 1))))
    const y = Math.min(alpha.height - 1, Math.max(0, Math.round(v * (alpha.height - 1))))
    return dist[y * alpha.width + x] * pxToWorld
  }
  const R1 = width * 0.075, R2 = width * 0.3
  const depth = (d: number) => {
    if (d <= 0) return 0
    const t1 = Math.min(d / R1, 1), t2 = Math.min(d / R2, 1)
    return width * (0.08 * (1 - (1 - t1) * (1 - t1)) + 0.055 * t2 * t2 * (3 - 2 * t2))
  }

  const nx = segX + 1, ny = segY + 1
  const pos = new Float32Array(nx * ny * 3)
  const uv = new Float32Array(nx * ny * 2)
  const inside = new Uint8Array(nx * ny)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const u = i / segX, v = j / segY
      const k = j * nx + i
      const d = sample(u, v)
      inside[k] = d > 0 ? 1 : 0
      pos.set([(u - 0.5) * width, NECK_Y - v * height, depth(d)], k * 3)
      uv.set([u, 1 - v], k * 2)
    }
  }
  const idx: number[] = []
  for (let j = 0; j < segY; j++) {
    for (let i = 0; i < segX; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, e = c + 1
      if (!inside[a] && !inside[b] && !inside[c] && !inside[e]) continue
      idx.push(a, c, b, b, c, e)
    }
  }
  const make = (sign: 1 | -1) => {
    const g = new THREE.BufferGeometry()
    const p = pos.slice()
    if (sign < 0) for (let k = 2; k < p.length; k += 3) p[k] = -p[k]
    g.setAttribute('position', new THREE.BufferAttribute(p, 3))
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    // il retro guarda all'indietro: ordine dei vertici invertito
    const index = sign > 0 ? idx : idx.map((_, n) => idx[n - (n % 3) + (2 - (n % 3))])
    g.setIndex(index)
    g.computeVertexNormals()
    g.computeBoundingSphere()
    return g
  }

  // Profilo delle spalle per adattare la gruccia
  const tops: number[] = []
  for (let i = 0; i < nx; i++) {
    let top = segY
    for (let j = 0; j < ny; j++) if (inside[j * nx + i]) { top = j; break }
    tops.push(NECK_Y - (top / segY) * height)
  }
  const shoulder = (x: number) => {
    const i = Math.round((x / width + 0.5) * segX)
    return tops[Math.min(segX, Math.max(0, i))]
  }
  return { front: make(1), back: make(-1), width, height, shoulder }
}

export function opaqueAt(alpha: AlphaMap, u: number, v: number) {
  const x = Math.round(u * (alpha.width - 1)), y = Math.round((1 - v) * (alpha.height - 1))
  if (x < 0 || y < 0 || x >= alpha.width || y >= alpha.height) return false
  return alpha.data[(y * alpha.width + x) * 4 + 3] > 128
}
