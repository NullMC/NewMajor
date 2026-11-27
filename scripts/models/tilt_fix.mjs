// Raddrizza l'inclinazione del busto: asse principale dei vertici centrali (|x| piccolo, senza le
// braccia) sul piano laterale (z, y) e frontale (x, y); aggiunge un nodo radice che lo porta in verticale.
// Uso: node tilt_fix.mjs <in.glb> <out.glb> [core=0.12]
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { getBounds } from '@gltf-transform/functions'

const [input, output, coreArg] = process.argv.slice(2)
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read(input)
const root = doc.getRoot()
const scene = root.listScenes()[0]
const b = getBounds(scene)
const H = b.max[1] - b.min[1], cx0 = (b.min[0] + b.max[0]) / 2
const core = Number(coreArg ?? 0.12) * H
const pts = []
for (const node of root.listNodes()) {
  const mesh = node.getMesh()
  if (!mesh) continue
  const m = node.getWorldMatrix()
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION')
    for (let i = 0; i < pos.getCount(); i += 2) {
      const p = pos.getElement(i, [])
      const w = [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r])
      if (Math.abs(w[0] - cx0) < core) pts.push(w)
    }
  }
}
const axisAngle = (u, v) => { // angolo dell'asse principale di (u, v) rispetto all'asse v
  const mu = pts.reduce((s, p) => s + p[u], 0) / pts.length, mv = pts.reduce((s, p) => s + p[v], 0) / pts.length
  let uu = 0, vv = 0, uv = 0
  for (const p of pts) { uu += (p[u] - mu) ** 2; vv += (p[v] - mv) ** 2; uv += (p[u] - mu) * (p[v] - mv) }
  return 0.5 * Math.atan2(2 * uv, vv - uu) // 0 = verticale; >0: u cresce con v
}
const pitch = axisAngle(2, 1) // il busto si sposta in z salendo
const roll = axisAngle(0, 1) + (Number(process.env.EXTRA_ROLL ?? 0) * Math.PI) / 180 // il busto si sposta in x salendo (+ correzione manuale)
// rotazione attorno a x di −pitch e attorno a z di +roll riportano (tan, 1, tan) su y
const qx = [Math.sin(-pitch / 2), 0, 0, Math.cos(-pitch / 2)]
const qz = [0, 0, Math.sin(roll / 2), Math.cos(roll / 2)]
const mul = (a, c) => [
  a[3] * c[0] + a[0] * c[3] + a[1] * c[2] - a[2] * c[1],
  a[3] * c[1] - a[0] * c[2] + a[1] * c[3] + a[2] * c[0],
  a[3] * c[2] + a[0] * c[1] - a[1] * c[0] + a[2] * c[3],
  a[3] * c[3] - a[0] * c[0] - a[1] * c[1] - a[2] * c[2],
]
const pivot = doc.createNode('tilt').setRotation(mul(qz, qx))
for (const child of scene.listChildren()) { scene.removeChild(child); pivot.addChild(child) }
scene.addChild(pivot)
await io.write(output, doc)
console.log(JSON.stringify({ points: pts.length, pitchDeg: +(pitch * 180 / Math.PI).toFixed(1), rollDeg: +(roll * 180 / Math.PI).toFixed(1) }))
