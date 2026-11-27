// Prepara un capo esportato da CLO (o altro CAD) per la ricostruzione dai pezzi del cartamodello:
// le UV del modello sono i suoi pezzi piatti (in mm). Per ogni mesh-pezzo si normalizzano le UV
// sul riquadro del pezzo principale (0..1), orientate come il pezzo visto dall'esterno: u da
// sinistra a destra, v dall'alto (collo, testa della manica) verso il basso. Le mesh vengono
// rinominate con il tipo di pezzo (front, back, sleeve_left, sleeve_right; le altre "trim").
// Nel configuratore ogni mesh mostra il pezzo corrispondente del cartamodello del prodotto,
// disegnato come nel file di produzione: le grafiche cadono dove verranno stampate e cucite.
// Negli extras della mesh (pieceRows) si salva, per ogni riga v, l'intervallo u [sinistra, destra]
// occupato dal pezzo: nel configuratore ogni riga viene adattata alla larghezza del pezzo del
// prodotto alla stessa altezza (giromanica, spalle e fianchi coincidono).
// Lo strato interno del tessuto (stesso pezzo, spostato verso l'interno dello spessore) va in una
// mesh a parte "<pezzo>_inner": dentro il capo si vede il colore del tessuto, non la stampa.
//
// Uso: node piece_uv.mjs <in.glb> <out.glb> <mesh=pezzo,...> [sagoma dati.ts]
//   es. 37=front,7=back,36=sleeve_left,39=sleeve_right tshirt src/features/configurator/garment/pieceModels.ts
// Con gli ultimi due argomenti scrive anche i pezzi del modello (contorno normalizzato, righe, misure in
// mm) per l'anteprima: le fasce vengono disegnate sulle cuciture del modello (spalle, giromanica).
// Poi: KEEP_UV=1 node optimize.mjs <out.glb> public/models/<nome>.glb ...
// Dipendenze come optimize.mjs.
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { unpartition } from '@gltf-transform/functions'
import fs from 'node:fs'

const [input, output, mapArg, shapeName, dataPath] = process.argv.slice(2)
const modelPieces = {}
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
    if (!best || tris > best.tris) best = { tris, box, I, find, root, uv }
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
  // larghezza del pezzo riga per riga (UV già normalizzate), solo sull'isola principale
  const ROWS = 120
  const rows = Array.from({ length: ROWS + 1 }, () => [Infinity, -Infinity])
  for (let t = 0; t < best.I.length; t += 3) {
    if (best.find(best.I[t]) !== best.root) continue
    const tri = [0, 1, 2].map((k) => best.uv.getElement(best.I[t + k], []))
    const v0 = Math.min(...tri.map((q) => q[1])), v1 = Math.max(...tri.map((q) => q[1]))
    for (let r = Math.ceil(v0 * ROWS); r <= Math.floor(v1 * ROWS); r++) {
      const v = r / ROWS
      for (let e = 0; e < 3; e++) {
        const [a, b] = [tri[e], tri[(e + 1) % 3]]
        if ((a[1] - v) * (b[1] - v) > 0 || a[1] === b[1]) continue
        const x = a[0] + ((v - a[1]) / (b[1] - a[1])) * (b[0] - a[0])
        rows[r][0] = Math.min(rows[r][0], x); rows[r][1] = Math.max(rows[r][1], x)
      }
    }
  }
  // righe senza intersezioni (estremi): la riga valida più vicina
  for (let r = 0; r <= ROWS; r++) if (!Number.isFinite(rows[r][0])) {
    let k = 1
    while (k <= ROWS && !Number.isFinite(rows[r - k]?.[0] ?? NaN) && !Number.isFinite(rows[r + k]?.[0] ?? NaN)) k++
    rows[r] = [...(Number.isFinite(rows[r - k]?.[0] ?? NaN) ? rows[r - k] : rows[r + k] ?? [0, 1])]
  }
  mesh.setExtras({ ...mesh.getExtras(), pieceRows: rows.map(([a, b]) => [Math.round(a * 1e4) / 1e4, Math.round(b * 1e4) / 1e4]) })
  // contorno del pezzo: lati di bordo (usati da un solo triangolo) dell'isola principale, concatenati
  const key = (i) => best.uv.getElement(i, []).map((x) => Math.round(x * 1e5)).join(',')
  const edges = new Map()
  for (let t = 0; t < best.I.length; t += 3) {
    if (best.find(best.I[t]) !== best.root) continue
    for (let e = 0; e < 3; e++) {
      const a = key(best.I[t + e]), b = key(best.I[t + (e + 1) % 3])
      const k = a < b ? a + '|' + b : b + '|' + a
      edges.set(k, (edges.get(k) ?? 0) + 1)
    }
  }
  const next = new Map()
  for (const [k, c] of edges) if (c === 1) { const [a, b] = k.split('|'); (next.get(a) ?? next.set(a, []).get(a)).push(b); (next.get(b) ?? next.set(b, []).get(b)).push(a) }
  let loop = []
  const seen = new Set()
  for (const startKey of next.keys()) {
    if (seen.has(startKey)) continue
    const cur = [startKey]; seen.add(startKey)
    let prev = null, at = startKey
    for (;;) {
      const nb = (next.get(at) ?? []).find((x) => x !== prev && !seen.has(x))
      if (!nb) break
      cur.push(nb); seen.add(nb); prev = at; at = nb
    }
    if (cur.length > loop.length) loop = cur
  }
  const pts = loop.map((k) => k.split(',').map((x) => Number(x) / 1e5))
  // semplificazione (Douglas-Peucker) a ~1 mm
  const tol = 1 / Math.max(u1 - u0, v1 - v0)
  const rdp = (p) => {
    if (p.length < 3) return p
    const [a, b] = [p[0], p[p.length - 1]]
    let best2 = -1, bd = tol
    for (let i = 1; i < p.length - 1; i++) {
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1
      const d = Math.abs(dy * p[i][0] - dx * p[i][1] + b[0] * a[1] - b[1] * a[0]) / l
      if (d > bd) { bd = d; best2 = i }
    }
    return best2 < 0 ? [a, b] : [...rdp(p.slice(0, best2 + 1)).slice(0, -1), ...rdp(p.slice(best2))]
  }
  const half = pts.length >> 1
  const outline = [...rdp(pts.slice(0, half + 1)).slice(0, -1), ...rdp([...pts.slice(half), pts[0]]).slice(0, -1)]
  modelPieces[kind] = {
    mm: [Math.round((u1 - u0) * 10) / 10, Math.round((v1 - v0) * 10) / 10],
    outline: outline.map(([u, v]) => [Math.round(u * 1e4) / 1e4, Math.round(v * 1e4) / 1e4]),
  }
  mesh.setName(kind)
  node.setName(kind)
  // strato interno: delle due primitive gemelle (stesso numero di vertici, una per faccia del
  // tessuto) è quella più arretrata lungo le normali
  const layer = (p) => {
    const pos = p.getAttribute('POSITION'), nor = p.getAttribute('NORMAL'), idx = p.getIndices()
    if (!nor || !idx) return null
    const set = new Set()
    for (let i = 0; i < idx.getCount(); i++) set.add(idx.getScalar(i))
    let d = 0
    for (const i of set) { const q = pos.getElement(i, []), n = nor.getElement(i, []); d += q[0] * n[0] + q[1] * n[1] + q[2] * n[2] }
    return { p, count: set.size, d: d / set.size }
  }
  const layers = mesh.listPrimitives().map(layer).filter(Boolean).sort((a, b) => b.count - a.count)
  const inner = layers.length >= 2 && layers[0].count === layers[1].count
    ? [layers[0].d < layers[1].d ? layers[0].p : layers[1].p] : []
  if (inner.length) {
    const innerMesh = doc.createMesh(kind + '_inner')
    for (const p of inner) { mesh.removePrimitive(p); innerMesh.addPrimitive(p) }
    const innerNode = doc.createNode(kind + '_inner').setMesh(innerMesh).setMatrix(node.getMatrix())
    const parent = node.getParentNode()
    if (parent) parent.addChild(innerNode)
    else for (const sc of doc.getRoot().listScenes()) if (sc.listChildren().includes(node)) sc.addChild(innerNode)
  }
  console.log(kind, 'strato interno', inner.length, { mm: [+(u1 - u0).toFixed(1), +(v1 - v0).toFixed(1)], flipU, flipV })
}
if (shapeName && dataPath) {
  const header = `// Generato da scripts/models/piece_uv.mjs: pezzi dei modelli 3D ricostruiti dai pezzi del cartamodello.
// Per ogni pezzo: misure in mm e contorno normalizzato (u da sinistra a destra visto dall'esterno, v dall'alto).
// Servono all'anteprima per disegnare le fasce sulle cuciture del modello (spalle, giromanica).
`
  const prev = fs.existsSync(dataPath) ? fs.readFileSync(dataPath, 'utf8').match(/= (\{[\s\S]*\})\n/)?.[1] : null
  const all = prev ? JSON.parse(prev) : {}
  all[shapeName] = modelPieces
  fs.writeFileSync(dataPath, header + '\nexport interface ModelPiece { mm: [number, number]; outline: [number, number][] }\n\nexport const MODEL_PIECES: Record<string, Partial<Record<string, ModelPiece>>> = ' + JSON.stringify(all) + '\n')
  console.log('dati dei pezzi scritti in', dataPath)
}
await doc.transform(unpartition()) // un solo buffer, come richiesto dal formato GLB
await io.write(output, doc)
