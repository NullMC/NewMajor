// Prepara un capo esportato da CLO (o altro CAD) per la ricostruzione dai pezzi del cartamodello:
// le UV del modello sono i suoi pezzi piatti (in mm). Per ogni mesh-pezzo si normalizzano le UV
// sul riquadro del pezzo principale (0..1), orientate come il pezzo visto dall'esterno: u da
// sinistra a destra, v dall'alto (collo, testa della manica) verso il basso. Le mesh vengono
// rinominate con il tipo di pezzo (front, back, sleeve_left, sleeve_right; le altre "trim").
// Nel configuratore ogni mesh mostra il pezzo corrispondente del cartamodello del prodotto,
// disegnato come nel file di produzione: le grafiche cadono dove verranno stampate e cucite.
//
// Uso: node piece_uv.mjs <in.glb> <out.glb> <mesh=pezzo,...>   es. 37=front,7=back,36=sleeve_left,39=sleeve_right
// Poi: KEEP_UV=1 node optimize.mjs <out.glb> public/models/<nome>.glb ...
// Dipendenze come optimize.mjs.
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { unpartition } from '@gltf-transform/functions'

const [input, output, mapArg] = process.argv.slice(2)
const map = Object.fromEntries(mapArg.split(',').map((x) => x.split('=')))
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read(input)

// direzione "destra" del pezzo visto dall'esterno (fronte verso +z, sinistra di chi indossa verso +x)
const RIGHT = {
  front: (p) => p[0],
  back: (p) => -p[0],
  // manica sinistra vista dal lato sinistro: a destra c'è il retro; la destra viceversa
  sleeve_left: (p) => -p[2],
  sleeve_right: (p) => p[2],
}

const corr = (a, b) => {
  const n = a.length, ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n
  let s = 0
  for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb)
  return s
}

for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh()
  if (!mesh) continue
  const kind = map[mesh.getName()] ?? map[node.getName()]
  if (!kind) { mesh.setName('trim'); node.setName('trim'); continue }
  const wm = node.getWorldMatrix()
  const world = (q) => [0, 1, 2].map((r) => wm[r] * q[0] + wm[4 + r] * q[1] + wm[8 + r] * q[2] + wm[12 + r])
  // isola principale (la più grande per triangoli) dalle UV: riquadro del pezzo
  let best = null
  const samples = { u: [], v: [], right: [], up: [] }
  for (const p of mesh.listPrimitives()) {
    const uv = p.getAttribute('TEXCOORD_0'), pos = p.getAttribute('POSITION'), idx = p.getIndices()
    const n = pos.getCount()
    const parent = Int32Array.from({ length: n }, (_, i) => i)
    const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a] } return a }
    const I = Array.from({ length: idx ? idx.getCount() : n }, (_, i) => (idx ? idx.getScalar(i) : i))
    for (let t = 0; t < I.length; t += 3) { const a = find(I[t]), b = find(I[t + 1]); parent[a] = b; parent[find(I[t + 2])] = find(b) }
    const count = new Map()
    for (let t = 0; t < I.length; t += 3) count.set(find(I[t]), (count.get(find(I[t])) ?? 0) + 1)
    const [root, tris] = [...count].sort((a, b) => b[1] - a[1])[0]
    const box = [Infinity, Infinity, -Infinity, -Infinity]
    for (let i = 0; i < n; i++) {
      if (find(i) !== root) continue
      const [u, v] = uv.getElement(i, [])
      box[0] = Math.min(box[0], u); box[1] = Math.min(box[1], v); box[2] = Math.max(box[2], u); box[3] = Math.max(box[3], v)
      if (i % 3 === 0) { const w = world(pos.getElement(i, [])); samples.u.push(u); samples.v.push(v); samples.right.push(RIGHT[kind](w)); samples.up.push(w[1]) }
    }
    if (!best || tris > best.tris) best = { tris, box }
  }
  const [u0, v0, u1, v1] = best.box
  const flipU = corr(samples.u, samples.right) < 0 // u deve crescere verso la destra del pezzo
  const flipV = corr(samples.v, samples.up) > 0 // v deve crescere verso il basso
  const done = new Set() // le primitive dello stesso pezzo possono condividere l'accessor delle UV
  for (const p of mesh.listPrimitives()) {
    const uv = p.getAttribute('TEXCOORD_0')
    if (done.has(uv)) continue
    done.add(uv)
    const out = new Float32Array(uv.getCount() * 2)
    for (let i = 0; i < uv.getCount(); i++) {
      const [u, v] = uv.getElement(i, [])
      let un = (u - u0) / (u1 - u0), vn = (v - v0) / (v1 - v0)
      if (flipU) un = 1 - un
      if (flipV) vn = 1 - vn
      out[i * 2] = Math.min(1, Math.max(0, un)); out[i * 2 + 1] = Math.min(1, Math.max(0, vn))
    }
    uv.setArray(out)
  }
  mesh.setName(kind)
  node.setName(kind)
  console.log(kind, { mm: [+(u1 - u0).toFixed(1), +(v1 - v0).toFixed(1)], flipU, flipV })
}
await doc.transform(unpartition()) // un solo buffer, come richiesto dal formato GLB
await io.write(output, doc)
