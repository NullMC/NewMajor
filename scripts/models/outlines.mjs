// Genera le sagome frontali dei modelli 3D (contorno esterno della vista frontale ortografica)
// e misura i riferimenti delle maniche.
// Uso: node outlines.mjs public/models src/features/configurator/garment/outlines.ts <riepilogo.json>
// Dipendenze come optimize.mjs. Dopo aver aggiunto un modello: inserirlo in MODELS e rigenerare.
// Unità della sagoma: x = x_modello * 100, y = (y_modello + 0.5) * 100 (orlo a 0, cima a 100).
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import fs from 'node:fs'
import { vec3 } from 'gl-matrix'
import path from 'node:path'

const [dir, outTs, outJson] = process.argv.slice(2)
await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })

// modello -> sagoma, altezza reale indicativa del modello (mm, taglia M) per la scala delle maniche
const MODELS = {
  longsleeve: { file: 'longsleeve.glb', mm: 720 },
  polo: { file: 'polo.glb', mm: 720 },
  // cappuccio alzato: la scollatura non è sul contorno, quota stimata sotto l'apertura del cappuccio
  hoodie: { file: 'hoodie.glb', mm: 900, neckY: 71 },
  track_jacket: { file: 'track_jacket.glb', mm: 700 },
  track_pants: { file: 'track_pants.glb', mm: 1050, bottom: true },
  jacket: { file: 'puffer.glb', mm: 760 },
  shorts: { file: 'shorts.glb', mm: 500, bottom: true },
}

const H = 800 // pixel per unità di altezza
const W = 1800 // copre x in [-1.125, 1.125]
const px = (x) => (x * H) + W / 2
const py = (y) => (0.5 - y) * H // riga 0 in alto

async function load(file) {
  const doc = await io.read(path.join(dir, file))
  const tris = []
  const verts = []
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')
      const idx = prim.getIndices()
      const wm = node.getWorldMatrix()
      const v = (i) => { const out = vec3.create(); vec3.transformMat4(out, pos.getElement(i, [0, 0, 0]), wm); return [out[0], out[1], out[2]] }
      const n = idx ? idx.getCount() : pos.getCount()
      for (let i = 0; i < pos.getCount(); i++) verts.push(v(i))
      for (let i = 0; i < n; i += 3) {
        const a = idx ? idx.getScalar(i) : i, b = idx ? idx.getScalar(i + 1) : i + 1, c = idx ? idx.getScalar(i + 2) : i + 2
        tris.push([v(a), v(b), v(c)])
      }
    }
  }
  return { tris, verts }
}

function rasterize(tris) {
  const g = new Uint8Array(W * H)
  for (const t of tris) {
    const p = t.map(([x, y]) => [px(x), py(y)])
    const minX = Math.max(0, Math.floor(Math.min(...p.map((q) => q[0]))))
    const maxX = Math.min(W - 1, Math.ceil(Math.max(...p.map((q) => q[0]))))
    const minY = Math.max(0, Math.floor(Math.min(...p.map((q) => q[1]))))
    const maxY = Math.min(H - 1, Math.ceil(Math.max(...p.map((q) => q[1]))))
    const [[x0, y0], [x1, y1], [x2, y2]] = p
    const d = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
    if (Math.abs(d) < 1e-9) continue
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const cx = x + 0.5, cy = y + 0.5
      const w0 = ((x1 - cx) * (y2 - cy) - (x2 - cx) * (y1 - cy)) / d
      const w1 = ((x2 - cx) * (y0 - cy) - (x0 - cx) * (y2 - cy)) / d
      const w2 = 1 - w0 - w1
      if (w0 >= -0.02 && w1 >= -0.02 && w2 >= -0.02) g[y * W + x] = 1
    }
  }
  return g
}

function morph(g, r, dilate) {
  const out = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = dilate ? 0 : 1
    for (let dy = -r; dy <= r && (dilate ? !v : v); dy++) for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx, yy = y + dy
      const s = xx >= 0 && yy >= 0 && xx < W && yy < H ? g[yy * W + xx] : 0
      if (dilate && s) { v = 1; break }
      if (!dilate && !s) { v = 0; break }
    }
    out[y * W + x] = v
  }
  return out
}

/** Riempie i buchi interni (tutto ciò che non è raggiungibile dal bordo). */
function fillHoles(g) {
  const out = new Uint8Array(W * H).fill(1)
  const stack = []
  for (let x = 0; x < W; x++) { stack.push(x, (H - 1) * W + x) }
  for (let y = 0; y < H; y++) { stack.push(y * W, y * W + W - 1) }
  while (stack.length) {
    const i = stack.pop()
    if (!out[i] || g[i]) continue
    out[i] = 0
    const x = i % W, y = (i / W) | 0
    if (x > 0) stack.push(i - 1)
    if (x < W - 1) stack.push(i + 1)
    if (y > 0) stack.push(i - W)
    if (y < H - 1) stack.push(i + W)
  }
  return out
}

/** Contorno esterno (Moore neighbour tracing) della componente più grande. */
function trace(g) {
  let start = -1
  for (let i = 0; i < W * H && start < 0; i++) if (g[i]) start = i
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]
  const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && g[y * W + x]
  let x = start % W, y = (start / W) | 0
  const sx = x, sy = y
  const pts = [[x, y]]
  let dir = 7
  for (let guard = 0; guard < W * H; guard++) {
    let found = false
    for (let k = 0; k < 8; k++) {
      const d = (dir + 6 + k) % 8 // parte da sinistra della direzione precedente
      const nx = x + dirs[d][0], ny = y + dirs[d][1]
      if (at(nx, ny)) { x = nx; y = ny; dir = d; found = true; break }
    }
    if (!found || (x === sx && y === sy)) break
    pts.push([x, y])
  }
  return pts
}

function rdp(pts, eps) {
  if (pts.length < 3) return pts
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1]
  const len = Math.hypot(bx - ax, by - ay) || 1
  let max = 0, idx = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len
    if (d > max) { max = d; idx = i }
  }
  if (max <= eps) return [pts[0], pts[pts.length - 1]]
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)]
}

/** Intervallo pieno della riga che contiene la colonna centrale. */
function centreInterval(g, row) {
  const c = W / 2
  if (!g[row * W + c]) return null
  let l = c, r = c
  while (l > 0 && g[row * W + l - 1]) l--
  while (r < W - 1 && g[row * W + r + 1]) r++
  return [l, r]
}

const toUnits = ([x, y]) => [+(((x - W / 2) / H) * 100).toFixed(1), +((1 - y / H) * 100).toFixed(1)]

const result = {}
for (const [shape, m] of Object.entries(MODELS)) {
  const { tris, verts } = await load(m.file)
  let g = rasterize(tris)
  g = morph(morph(g, 2, true), 2, false)
  g = fillHoles(g)
  const contour = trace(g)
  // chiusura: RDP su anello spezzato in due metà
  const half = contour.length >> 1
  const simp = [...rdp(contour.slice(0, half + 1), 1.2).slice(0, -1), ...rdp([...contour.slice(half), contour[0]], 1.2).slice(0, -1)]
  const outline = simp.map(toUnits)

  // quota dell'orlo e del collo sull'asse centrale
  const centreRows = []
  for (let y = 0; y < H; y++) if (g[y * W + W / 2]) centreRows.push(y)
  const topRow = centreRows[0], hemRow = centreRows[centreRows.length - 1]
  const info = { outline, hemY: +((1 - hemRow / H) * 100).toFixed(1), neckY: m.neckY ?? +((1 - topRow / H) * 100).toFixed(1), unitPerMm: +(1 / m.mm).toFixed(7) }

  if (!m.bottom) {
    // mezza larghezza del busto: minimo dell'intervallo centrale tra 8% e 45% dell'altezza del busto
    const torsoH = hemRow - topRow
    let half = Infinity
    for (let y = Math.round(hemRow - torsoH * 0.45); y <= Math.round(hemRow - torsoH * 0.08); y++) {
      const iv = centreInterval(g, y)
      if (iv) half = Math.min(half, (iv[1] - iv[0]) / 2)
    }
    const minAbsX = (half / H) * 1.04
    // sommità della manica: punto più alto della sagoma alla colonna x = minAbsX
    const col = Math.round(W / 2 + minAbsX * H)
    let top = 0
    while (top < H && !g[top * W + col]) top++
    const topY = 0.5 - top / H
    // asse fronte-retro della spalla: media z dei vertici vicini al punto spalla
    const near = verts.filter(([x, y]) => Math.abs(Math.abs(x) - minAbsX) < 0.03 && Math.abs(y - topY) < 0.03)
    const z = near.length ? near.reduce((s, v) => s + v[2], 0) / near.length : 0
    // direzione del braccio (lato +x): asse principale dei pixel oltre il busto
    const arm = []
    for (let y = 0; y < H; y++) for (let x = col + Math.round(0.04 * H); x < W; x++) if (g[y * W + x]) arm.push([(x - W / 2) / H, 0.5 - y / H])
    const ys = arm.map((p) => p[1])
    const vExtent = Math.max(...ys) - Math.min(...ys)
    let dir = [0, -1]
    if (vExtent > 0.3) {
      const mx = arm.reduce((s, p) => s + p[0], 0) / arm.length, my = arm.reduce((s, p) => s + p[1], 0) / arm.length
      let sxx = 0, sxy = 0, syy = 0
      for (const [x, y] of arm) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); syy += (y - my) ** 2 }
      const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy)
      dir = [Math.cos(ang), Math.sin(ang)]
      if (dir[1] > 0 || (Math.abs(dir[1]) < 1e-3 && dir[0] < 0)) dir = [-dir[0], -dir[1]]
    }
    info.sleeve = { topY: +topY.toFixed(4), z: +z.toFixed(4), minAbsX: +minAbsX.toFixed(4), dir: dir.map((v) => +v.toFixed(4)) }
  }
  result[shape] = info
  console.log(shape, outline.length, 'pt', JSON.stringify({ ...info, outline: undefined }))
}

fs.writeFileSync(outJson, JSON.stringify(result))
const header = `// GENERATO da scripts/models/outlines.mjs: non modificare a mano.
// Sagome frontali dei modelli 3D (vista ortografica), in unità: x = x_modello · 100,
// y = (y_modello + 0.5) · 100. hemY/neckY = orlo e sommità sull'asse centrale;
// sleeve = riferimenti per la proiezione delle maniche nel modello normalizzato.
import type { Pt } from './shapes'

export interface ModelOutline {
  outline: Pt[]
  hemY: number
  neckY: number
  unitPerMm: number
  sleeve?: { topY: number; z: number; minAbsX: number; dir: [number, number] }
}

`
const body = Object.entries(result).map(([k, v]) =>
  `  ${k}: {\n    hemY: ${v.hemY}, neckY: ${v.neckY}, unitPerMm: ${v.unitPerMm},\n` +
  (v.sleeve ? `    sleeve: ${JSON.stringify(v.sleeve).replace(/"(\w+)":/g, '$1: ')},\n` : '') +
  `    outline: ${JSON.stringify(v.outline)},\n  },`).join('\n')
fs.writeFileSync(outTs, `${header}export const MODEL_OUTLINES = {\n${body}\n} satisfies Record<string, ModelOutline>\n`)
