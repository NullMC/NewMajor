// Capi con guscio spesso (superficie esterna e interna, es. piumini esportati da CLO): la proiezione
// sceglie fronte/retro dal segno di normal.z, quindi la superficie interna che affiora dopo la
// semplificazione mostrerebbe la grafica del lato opposto. Per ogni cella (x, y) della vista frontale
// si calcola la profondità media del capo; i vertici nettamente davanti hanno normal.z ≥ 0, quelli
// nettamente dietro normal.z ≤ 0 (altrimenti la normale viene invertita). Ai bordi non cambia nulla.
// Uso: node zside_fix.mjs <in.glb> <out.glb> [margine=0.3]
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'

const [input, output, marginArg] = process.argv.slice(2)
const margin = Number(marginArg ?? 0.3)
const MINZ = Number(process.env.MINZ ?? 0.35) // |normal.z| minima sui vertici nettamente davanti/dietro
await MeshoptDecoder.ready
await MeshoptEncoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })
const doc = await io.read(input)
const prims = []
// posizioni nello spazio del modello: con la quantizzazione ogni mesh ha la sua trasformazione nel nodo
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh()
  if (!mesh) continue
  const m = node.getWorldMatrix()
  const world = (p) => [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r])
  for (const p of mesh.listPrimitives()) if (p.getAttribute('NORMAL')) prims.push({ p, world })
}
const G = 0.02 // lato della cella (il modello è alto 1)
const cell = (x, y) => `${Math.floor(x / G)},${Math.floor(y / G)}`
const range = new Map()
for (const { p, world } of prims) {
  const pos = p.getAttribute('POSITION')
  for (let i = 0; i < pos.getCount(); i++) {
    const [x, y, z] = world(pos.getElement(i, []))
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) { // celle vicine: riduce i buchi
      const k = cell(x + dx * G, y + dy * G)
      const r = range.get(k) ?? [Infinity, -Infinity]
      r[0] = Math.min(r[0], z); r[1] = Math.max(r[1], z)
      range.set(k, r)
    }
  }
}
let checked = 0, flipped = 0
for (const { p, world } of prims) {
  const pos = p.getAttribute('POSITION'), nor = p.getAttribute('NORMAL')
  for (let i = 0; i < pos.getCount(); i++) {
    const [x, y, z] = world(pos.getElement(i, []))
    const [lo, hi] = range.get(cell(x, y))
    const mid = (lo + hi) / 2, half = (hi - lo) / 2
    if (half < 0.01 || Math.abs(z - mid) < margin * half) continue
    checked++
    const n = nor.getElement(i, [])
    // lato giusto e componente z abbastanza netta da non mescolare fronte e retro nello shader
    const side = Math.sign(z - mid)
    let m = (z - mid) * n[2] < 0 ? [-n[0], -n[1], -n[2]] : n
    if (m[2] * side < MINZ) {
      const xy = Math.hypot(m[0], m[1]) || 1, k = Math.sqrt(1 - MINZ * MINZ) / xy
      m = [m[0] * k, m[1] * k, side * MINZ]
    }
    if (m !== n) { nor.setElement(i, m); flipped++ }
  }
}
await io.write(output, doc)
console.log(JSON.stringify({ checked, flipped }))
