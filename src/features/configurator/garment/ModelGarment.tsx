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
import { MODEL_OUTLINES } from './outlines'

export interface GarmentModel {
  url: string
  /**
   * Riferimento delle maniche nel modello normalizzato: sommità della manica (x = minAbsX, y = topY),
   * asse fronte-retro della spalla (z) e direzione del braccio sinistro nel piano frontale (dir).
   * Assente per i capi senza maniche (pantaloncino, pantalone).
   */
  sleeve?: { topY: number; z: number; minAbsX: number; dir: [number, number] }
  /** Unità del modello per millimetro reale (il modello normalizzato è alto 1; valore indicativo, taglia M). */
  unitPerMm: number
}

const fromOutline = (url: string, o: { unitPerMm: number; sleeve?: GarmentModel['sleeve'] }): GarmentModel => ({ url, unitPerMm: o.unitPerMm, sleeve: o.sleeve })

/**
 * Modelli disponibili per sagoma (altezza normalizzata a 1, fronte verso +z, sinistra di chi indossa
 * verso +x). Fonti e licenze in public/models/CREDITS.md.
 */
export const GARMENT_MODELS: Partial<Record<ModelShape, GarmentModel>> = {
  // maglia CLO alta 706 mm; spalla misurata sul modello originale
  tshirt: { url: '/models/jersey.glb', sleeve: { topY: 0.376, z: -0.047, minAbsX: 0.25, dir: [0, -1] }, unitPerMm: 1 / 706 },
  longsleeve: fromOutline('/models/longsleeve.glb', MODEL_OUTLINES.longsleeve),
  polo: fromOutline('/models/polo.glb', MODEL_OUTLINES.polo),
  hoodie: fromOutline('/models/hoodie.glb', MODEL_OUTLINES.hoodie),
  track_jacket: fromOutline('/models/track_jacket.glb', MODEL_OUTLINES.track_jacket),
  track_pants: fromOutline('/models/track_pants.glb', MODEL_OUTLINES.track_pants),
  jacket: fromOutline('/models/puffer.glb', MODEL_OUTLINES.jacket),
  puffer: fromOutline('/models/puffer.glb', MODEL_OUTLINES.jacket),
  shorts: fromOutline('/models/shorts.glb', MODEL_OUTLINES.shorts),
}

/** Manica per l'anteprima: canvas con i soli elementi e riquadro/riferimento del pezzo in mm. */
export interface SleeveTexture { texture: THREE.Texture; rect: [number, number, number, number]; anchor: [number, number] }

const EMPTY = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1)
  t.needsUpdate = true
  return t
})()

const cache = new Map<string, Promise<THREE.BufferGeometry[]>>()

/** Carica il modello una sola volta e restituisce le geometrie dei pezzi (fronte, retro, maniche, colletto). */
export function loadModel(url: string) {
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

/** Pre-carica i modelli delle sagome indicate (es. dalla pagina prodotto, prima di aprire il configuratore). */
export function preloadGarmentModels(shapes: ModelShape[]) {
  for (const s of new Set(shapes)) {
    const url = GARMENT_MODELS[s]?.url
    if (url) void loadModel(url).catch(() => undefined)
  }
}

export function useGarmentModel(shape: ModelShape) {
  const url = GARMENT_MODELS[shape]?.url
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

export function projectionMaterial(shape: ModelShape, front: THREE.Texture, back: THREE.Texture, base: string) {
  const b = getShape(shape).bounds
  const model = GARMENT_MODELS[shape]
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
    uSleeveL: { value: EMPTY as THREE.Texture },
    uSleeveR: { value: EMPTY as THREE.Texture },
    uSL: { value: new THREE.Vector4(0, 0, 1, 1) },
    uSR: { value: new THREE.Vector4(0, 0, 1, 1) },
    uSLA: { value: new THREE.Vector2() },
    uSRA: { value: new THREE.Vector2() },
    uShoulder: { value: new THREE.Vector3(model?.sleeve?.topY ?? 0, model?.sleeve?.z ?? 0, model?.sleeve?.minAbsX ?? 99) },
    uArm: { value: new THREE.Vector2(...(model?.sleeve?.dir ?? [0, -1])).normalize() },
    uMm: { value: model?.unitPerMm ?? 0.001 },
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
uniform float uScale, uMinX, uMinY, uW, uH;
uniform sampler2D uSleeveL;
uniform sampler2D uSleeveR;
uniform vec4 uSL, uSR;
uniform vec2 uSLA, uSRA;
uniform vec3 uShoulder;
uniform vec2 uArm;
uniform float uMm;
// elementi della manica: proiezione laterale; dal pezzo (mm) si risale alle coordinate del canvas
vec4 sleeveSample(sampler2D tex, vec4 rect, vec2 anchor, float dxMm, float dyMm) {
  vec2 p = vec2(anchor.x + dxMm, anchor.y - dyMm);
  vec2 uv = (p - rect.xy) / rect.zw;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  vec4 c = texture2D(tex, clamp(uv, 0.0, 1.0));
  c.a *= inside;
  return c;
}`,
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
vec3 col = mix(uBase, tx.rgb, tx.a);
// maniche: proiezione perpendicolare al braccio. Lungo il braccio (dalla sommità della manica)
// si misura la quota del pezzo; l'asse fronte-retro dà l'ascissa. Il lato esterno del braccio
// è la perpendicolare alla direzione, rivolta verso l'alto/esterno (per un braccio verticale: +x).
vec3 nrm = normalize(vObjNormal);
if (abs(vObjPos.x) > uShoulder.z) {
  if (vObjPos.x > 0.0) {
    // manica sinistra vista dall'esterno: la destra del pezzo va verso il retro (-z)
    vec2 d = uArm;
    vec2 o = vec2(-d.y, d.x);
    float along = dot(vObjPos.xy - vec2(uShoulder.z, uShoulder.x), d) / uMm;
    vec4 sl = sleeveSample(uSleeveL, uSL, uSLA, (uShoulder.y - vObjPos.z) / uMm, along);
    col = mix(col, sl.rgb, sl.a * smoothstep(0.1, 0.5, dot(nrm.xy, o)));
  } else {
    vec2 d = vec2(-uArm.x, uArm.y);
    vec2 o = vec2(d.y, -d.x);
    float along = dot(vObjPos.xy - vec2(-uShoulder.z, uShoulder.x), d) / uMm;
    vec4 sr = sleeveSample(uSleeveR, uSR, uSRA, (vObjPos.z - uShoulder.y) / uMm, along);
    col = mix(col, sr.rgb, sr.a * smoothstep(0.1, 0.5, dot(nrm.xy, o)));
  }
}
diffuseColor.rgb *= col;`,
      )
  }
  return { mat, uniforms }
}

export function ModelGarment({ shape, geos, front, back, baseColor, sleeveLeft, sleeveRight }: {
  shape: ModelShape; geos: THREE.BufferGeometry[]; front: THREE.Texture; back: THREE.Texture; baseColor: string
  sleeveLeft?: SleeveTexture | null; sleeveRight?: SleeveTexture | null
}) {
  const { mat, uniforms } = useMemo(() => projectionMaterial(shape, front, back, baseColor), [shape, front, back]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { uniforms.uBase.value.set(baseColor) }, [baseColor, uniforms])
  useEffect(() => {
    uniforms.uSleeveL.value = sleeveLeft?.texture ?? EMPTY
    uniforms.uSleeveR.value = sleeveRight?.texture ?? EMPTY
    if (sleeveLeft) { uniforms.uSL.value.set(...sleeveLeft.rect); uniforms.uSLA.value.set(...sleeveLeft.anchor) }
    if (sleeveRight) { uniforms.uSR.value.set(...sleeveRight.rect); uniforms.uSRA.value.set(...sleeveRight.anchor) }
  }, [sleeveLeft, sleeveRight, uniforms])
  useEffect(() => () => mat.dispose(), [mat])
  // altezza 1 → 1.78 unità di scena; i modelli con le braccia aperte vengono ridotti per restare nell'inquadratura
  const scale = useMemo(() => {
    const box = new THREE.Box3()
    for (const g of geos) { g.computeBoundingBox(); box.union(g.boundingBox!) }
    return Math.min(1.78, 2.3 / Math.max(0.01, box.max.x - box.min.x))
  }, [geos])
  return (
    <group scale={scale} position={[0, 0.02, 0]}>
      {geos.map((g, i) => <mesh key={i} geometry={g} material={mat} castShadow receiveShadow />)}
    </group>
  )
}
