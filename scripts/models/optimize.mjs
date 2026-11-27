// Prepara un modello 3D di capo per il web: niente texture (la grafica viene proiettata dal
// configuratore), trasformazioni dei nodi applicate, centrato e scalato ad altezza 1,
// semplificato e compresso con meshopt. Il fronte del capo deve guardare verso +z.
// Uso: node optimize.mjs <input.glb> <output.glb> [ratio] ["nota licenza"]  (SIMPLIFY_ERROR=0.004 per semplificare di più)
// Dipendenze (fuori dal progetto, in una cartella di lavoro):
//   npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer gl-matrix
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions'
import { prune, dedup, weld, simplify, quantize, getBounds, transformMesh } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import { mat4 } from 'gl-matrix'

const [input, output, ratioArg, note] = process.argv.slice(2)
const ratio = Number(ratioArg ?? 0.45)
await MeshoptEncoder.ready
await MeshoptSimplifier.ready

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
const doc = await io.read(input)
const root = doc.getRoot()

// 1. via texture e materiali di stoffa: un solo materiale neutro
for (const t of root.listTextures()) t.dispose()
const mat = doc.createMaterial('Fabric').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.85).setMetallicFactor(0).setDoubleSided(true)
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
  p.setMaterial(mat)
  for (const name of p.listSemantics()) if (name !== 'POSITION' && name !== 'NORMAL') p.setAttribute(name, null)
}
for (const m of root.listMaterials()) if (m !== mat) m.dispose()
for (const ext of root.listExtensionsUsed()) if (!['EXT_meshopt_compression', 'KHR_mesh_quantization'].includes(ext.extensionName)) ext.dispose()

// 2. centra e porta ad altezza 1 (x a destra, y in alto, z verso chi guarda)
const scene = root.listScenes()[0]
// applica alle geometrie le trasformazioni reali dei nodi (rotazioni Z-up → Y-up, scale, traslazioni)
const world = root.listNodes().filter((n) => n.getMesh()).map((n) => [n, n.getWorldMatrix()])
const seen = new Set()
for (const [node, wm] of world) {
  let mesh = node.getMesh()
  if (seen.has(mesh)) { mesh = mesh.clone(); node.setMesh(mesh) } // mesh condivisa: copia prima di trasformare
  seen.add(mesh)
  transformMesh(mesh, wm)
}
for (const node of root.listNodes()) node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1])
const b = getBounds(scene)
const h = b.max[1] - b.min[1]
const c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]
const s = 1 / h
const m = mat4.create()
mat4.scale(m, m, [s, s, s])
mat4.translate(m, m, [-c[0], -c[1], -c[2]])
for (const node of root.listNodes()) {
  const mesh = node.getMesh()
  if (mesh) transformMesh(mesh, m)
  node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1])
}

// 3. alleggerisce e comprime
await doc.transform(
  dedup(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio, error: Number(process.env.SIMPLIFY_ERROR ?? 0.0008) }),
  prune(),
  quantize(),
)
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })
doc.getRoot().getAsset().generator = `New Major · ottimizzato${note ? ` · ${note}` : ''} (vedi public/models/CREDITS.md)`
await io.write(output, doc)

let tris = 0
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3
const nb = getBounds(scene)
console.log(JSON.stringify({ tris: Math.round(tris), meshes: root.listMeshes().map((x) => x.getName()), min: nb.min.map((v) => +v.toFixed(3)), max: nb.max.map((v) => +v.toFixed(3)) }))
