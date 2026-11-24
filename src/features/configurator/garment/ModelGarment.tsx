// Capo da modello 3D reale (GLB) con le grafiche proiettate fronte/retro.
//
// I pannelli del configuratore (fronte e retro, disegnati su canvas nelle coordinate
// della sagoma 2D) vengono proiettati sul modello: le facce rivolte in avanti leggono il
// pannello fronte, quelle all'indietro il retro, con una sfumatura sui fianchi. Non serve
// la mappatura UV del modello, quindi funziona con qualunque maglia in formato GLB.
// Dove il pannello è trasparente (fuori dalla sagoma 2D) si usa il colore base.

import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import type { ModelShape } from '@/types/db'
import { getShape } from './shapes'

/** Modelli disponibili per sagoma (altezza normalizzata a 1, fronte verso +z). */
export const GARMENT_MODELS: Partial<Record<ModelShape, string>> = {
  tshirt: '/models/jersey.glb',
}

const cache = new Map<string, Promise<THREE.BufferGeometry[]>>()

/** Carica il modello una sola volta e restituisce le geometrie dei pezzi (fronte, retro, maniche, colletto). */
function loadModel(url: string) {
  let p = cache.get(url)
  if (!p) {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    p = loader.loadAsync(url).then((gltf) => {
      gltf.scene.updateMatrixWorld(true)
      const geos: THREE.BufferGeometry[] = []
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
        if (!g.attributes.normal) g.computeVertexNormals()
        geos.push(g)
      })
      return geos
    })
    p.catch(() => cache.delete(url))
    cache.set(url, p)
  }
  return p
}

export function useGarmentModel(shape: ModelShape) {
  const url = GARMENT_MODELS[shape]
  const [state, setState] = useState<{ url?: string; geos?: THREE.BufferGeometry[]; failed?: boolean }>({})
  useEffect(() => {
    if (!url) return
    let alive = true
    loadModel(url).then(
      (geos) => { if (alive) setState({ url, geos }) },
      () => { if (alive) setState({ url, failed: true }) },
    )
    return () => { alive = false }
  }, [url])
  if (!url) return { status: 'none' as const }
  if (state.url !== url) return { status: 'loading' as const }
  return state.failed ? { status: 'failed' as const } : { status: 'ready' as const, geos: state.geos! }
}

function projectionMaterial(shape: ModelShape, front: THREE.Texture, back: THREE.Texture, base: string) {
  const b = getShape(shape).bounds
  // Altezza del modello (1) = altezza della sagoma; il fondo del capo coincide con il fondo della sagoma
  const scale = b.maxY - b.minY
  const uniforms = {
    uFront: { value: front },
    uBack: { value: back },
    uBase: { value: new THREE.Color(base) },
    uScale: { value: scale },
    uMinX: { value: b.minX },
    uMinY: { value: b.minY },
    uW: { value: b.maxX - b.minX },
    uH: { value: b.maxY - b.minY },
  }
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.86, metalness: 0, side: THREE.DoubleSide })
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nvarying vec3 vObjNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;\nvObjNormal = normal;')
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vObjPos;
varying vec3 vObjNormal;
uniform sampler2D uFront;
uniform sampler2D uBack;
uniform vec3 uBase;
uniform float uScale, uMinX, uMinY, uW, uH;`,
      )
      .replace(
        '#include <map_fragment>',
        `// punto del modello -> coordinate della sagoma 2D -> coordinate del pannello
vec2 s = vec2(vObjPos.x * uScale, (vObjPos.y + 0.5) * uScale + uMinY);
float u = (s.x - uMinX) / uW;
float v = (s.y - uMinY) / uH;
vec4 f = texture2D(uFront, vec2(u, v));
vec4 bk = texture2D(uBack, vec2(1.0 - u, v)); // il retro è disegnato visto da dietro
float wf = smoothstep(-0.28, 0.28, normalize(vObjNormal).z);
vec4 tx = mix(bk, f, wf);
diffuseColor.rgb *= mix(uBase, tx.rgb, tx.a);`,
      )
  }
  return { mat, uniforms }
}

export function ModelGarment({ shape, geos, front, back, baseColor }: {
  shape: ModelShape; geos: THREE.BufferGeometry[]; front: THREE.Texture; back: THREE.Texture; baseColor: string
}) {
  const { mat, uniforms } = useMemo(() => projectionMaterial(shape, front, back, baseColor), [shape, front, back]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { uniforms.uBase.value.set(baseColor) }, [baseColor, uniforms])
  useEffect(() => () => mat.dispose(), [mat])
  return (
    <group scale={1.78} position={[0, 0.02, 0]}>
      {geos.map((g, i) => <mesh key={i} geometry={g} material={mat} castShadow receiveShadow />)}
    </group>
  )
}
