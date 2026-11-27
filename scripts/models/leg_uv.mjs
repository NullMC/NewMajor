// Prepara pantaloncini e pantaloni per la ricostruzione dai pezzi del cartamodello, dove ogni gamba
// è un pezzo intero (davanti e dietro uniti, tagliato lungo l'interno gamba e le cuciture centrali).
// Le mesh vengono divise in leg_left (x > 0, sinistra di chi indossa) e leg_right; ogni vertice
// riceve TEXCOORD_0 = (t, s):
//   t = giro attorno alla gamba: 0 all'interno, 0,25 davanti, 0,5 esterno, 0,75 dietro, 1 di nuovo
//       all'interno (= dal bordo "davanti" al bordo "dietro" del pezzo);
//   s = altezza: 0 in vita, 1 all'orlo.
// Nel configuratore (t, s) viene adattato riga per riga al contorno del pezzo del prodotto.
// Il fronte del capo deve guardare verso +z.
// Uso: node leg_uv.mjs <in.glb> <out.glb>   poi KEEP_UV=1 node optimize.mjs <out.glb> ...
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'

const [input, output] = process.argv.slice(2)
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const src = await io.read(input)

// triangoli in coordinate mondo
const tris = []
for (const node of src.getRoot().listNodes()) {
  const mesh = node.getMesh()
  if (!mesh) continue
  const m = node.getWorldMatrix()
  const P = (q) => [0, 1, 2].map((r) => m[r] * q[0] + m[4 + r] * q[1] + m[8 + r] * q[2] + m[12 + r])
  const N = (q) => { const v = [0, 1, 2].map((r) => m[r] * q[0] + m[4 + r] * q[1] + m[8 + r] * q[2]); const l = Math.hypot(...v) || 1; return v.map((x) => x / l) }
  for (const p of mesh.listPrimitives()) {
    const pos = p.getAttribute('POSITION'), nor = p.getAttribute('NORMAL'), idx = p.getIndices()
    const n = idx ? idx.getCount() : pos.getCount()
    for (let i = 0; i < n; i += 3) {
      const ids = [0, 1, 2].map((k) => (idx ? idx.getScalar(i + k) : i + k))
      tris.push(ids.map((j) => ({ p: P(pos.getElement(j, [])), n: nor ? N(nor.getElement(j, [])) : [0, 0, 1] })))
    }
  }
}
let yTop = -Infinity, yBot = Infinity
for (const t of tris) for (const v of t) { yTop = Math.max(yTop, v.p[1]); yBot = Math.min(yBot, v.p[1]) }
const H = yTop - yBot

const doc = new Document()
const buffer = doc.createBuffer()
const scene = doc.createScene()
const mat = doc.createMaterial('Fabric')
for (const [name, side] of [['leg_left', 1], ['leg_right', -1]]) {
  const mine = tris.filter((t) => Math.sign(t.reduce((s, v) => s + v.p[0], 0)) === side)
  // asse della gamba per fasce di altezza: centro del riquadro x/z dei vertici della fascia
  const BANDS = 50
  const box = Array.from({ length: BANDS }, () => [Infinity, -Infinity, Infinity, -Infinity])
  const band = (y) => Math.min(BANDS - 1, Math.max(0, Math.floor(((yTop - y) / H) * BANDS)))
  for (const t of mine) for (const v of t) { const b = box[band(v.p[1])]; b[0] = Math.min(b[0], v.p[0]); b[1] = Math.max(b[1], v.p[0]); b[2] = Math.min(b[2], v.p[2]); b[3] = Math.max(b[3], v.p[2]) }
  const centre = (y) => { const b = box[band(y)]; return Number.isFinite(b[0]) ? [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2] : [side * 0.1, 0] }
  const tOf = ({ p }) => {
    const [cx, cz] = centre(p[1])
    const phi = Math.atan2(p[2] - cz, (p[0] - cx) * side) // 0 esterno, +π/2 davanti, ±π interno
    return (Math.PI - phi) / (2 * Math.PI)
  }
  // sopra il cavallo la "gamba" è mezzo bacino (aperta sulle cuciture centrali): il giro va da circa
  // 0,1 (centro davanti) a 0,9 (centro dietro). Per ogni fascia si porta l'intervallo presente a 0..1,
  // così le cuciture centrali cadono sui bordi del pezzo (cavallo davanti e dietro)
  const vals = Array.from({ length: BANDS }, () => [])
  for (const t of mine) for (const v of t) vals[band(v.p[1])].push(tOf(v))
  const range = vals.map((a) => {
    if (a.length < 10) return null
    const s = [...a].sort((x, y) => x - y)
    return [s[Math.floor(s.length * 0.01)], s[Math.ceil(s.length * 0.99) - 1]]
  })
  for (let i = 0; i < BANDS; i++) if (!range[i]) range[i] = range[i - 1] ?? range.find(Boolean) ?? [0, 1]
  const stretch = (v) => {
    const f = Math.min(BANDS - 1, Math.max(0, ((yTop - v.p[1]) / H) * BANDS - 0.5))
    const i0 = Math.floor(f), i1 = Math.min(BANDS - 1, i0 + 1), k = f - i0
    const lo = range[i0][0] + (range[i1][0] - range[i0][0]) * k, hi = range[i0][1] + (range[i1][1] - range[i0][1]) * k
    return Math.min(1, Math.max(0, (tOf(v) - lo) / Math.max(1e-3, hi - lo)))
  }
  const pos = [], nor = [], uv = []
  for (const t of mine) {
    let ts = t.map(stretch)
    // triangolo a cavallo del taglio interno (t passa da 1 a 0): si porta tutto sullo stesso lato
    if (Math.max(...ts) - Math.min(...ts) > 0.5) {
      const near0 = ts.filter((x) => x < 0.5).length
      ts = ts.map((x) => (near0 >= 2 ? (x > 0.5 ? 0 : x) : (x < 0.5 ? 1 : x)))
    }
    t.forEach((v, k) => { pos.push(...v.p); nor.push(...v.n); uv.push(ts[k], (yTop - v.p[1]) / H) })
  }
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(nor)).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(uv)).setBuffer(buffer))
    .setMaterial(mat)
  const mesh = doc.createMesh(name).addPrimitive(prim)
  scene.addChild(doc.createNode(name).setMesh(mesh))
  console.log(name, 'triangoli', mine.length)
}
await io.write(output, doc)
