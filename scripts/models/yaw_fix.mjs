// Raddrizza un capo ruotato attorno alla verticale: l'asse principale (PCA) dei vertici sul piano
// orizzontale (braccia aperte → asse spalle) viene allineato a x. Aggiunge un nodo radice ruotato.
// Uso: node yaw_fix.mjs <in.glb> <out.glb> [gradi extra]
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'

const [input, output, extraArg] = process.argv.slice(2)
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read(input)
const root = doc.getRoot()
let sx = 0, sz = 0, n = 0
const pts = []
for (const node of root.listNodes()) {
  const mesh = node.getMesh()
  if (!mesh) continue
  const m = node.getWorldMatrix()
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION')
    for (let i = 0; i < pos.getCount(); i += 3) {
      const p = pos.getElement(i, [])
      const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]
      pts.push([x, z]); sx += x; sz += z; n++
    }
  }
}
const cx = sx / n, cz = sz / n
let xx = 0, zz = 0, xz = 0
for (const [x, z] of pts) { xx += (x - cx) ** 2; zz += (z - cz) ** 2; xz += (x - cx) * (z - cz) }
const theta = 0.5 * Math.atan2(2 * xz, xx - zz) // angolo dell'asse principale rispetto a x
const extra = (Number(extraArg ?? 0) * Math.PI) / 180
// rotazione attorno a y di +theta porta l'asse (cos θ, sin θ) su x (in glTF: x' = x cos + z sin)
const a = theta + extra
const q = [0, Math.sin(a / 2), 0, Math.cos(a / 2)]
const scene = root.listScenes()[0]
const pivot = doc.createNode('yaw').setRotation(q)
for (const child of scene.listChildren()) { scene.removeChild(child); pivot.addChild(child) }
scene.addChild(pivot)
await io.write(output, doc)
console.log(JSON.stringify({ thetaDeg: +(theta * 180 / Math.PI).toFixed(2), appliedDeg: +(a * 180 / Math.PI).toFixed(2) }))
