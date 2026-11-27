// Mockup 3D live del capo (React Three Fiber). Caricato in lazy solo nel configuratore.
//
// Se per la sagoma esiste un modello 3D reale (GARMENT_MODELS) le grafiche vengono
// proiettate su di esso; altrimenti, o finché il modello non è pronto, la mesh è generata
// dalla sagoma: due superfici (fronte/retro) a "cuscino" la cui profondità dipende dalla
// distanza dal bordo, ritagliate con alphaTest sulla texture.

import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { ModelShape } from '@/types/db'
import { getShape } from './shapes'
import { buildPanelGeometry } from './geometry'
import { hasPieceMeshes, ModelGarment, PieceGarment, useGarmentModel, type SleeveTexture } from './ModelGarment'
import type { PieceSet } from './pieces'

function usePanelTexture(canvas: HTMLCanvasElement | null, version: number, flipY = true) {
  const { gl, invalidate } = useThree()
  // Una texture WebGL non può cambiare dimensioni dopo il primo caricamento: quando il canvas
  // viene ridisegnato con proporzioni diverse (es. passaggio maglia → pantaloncino) va ricreata,
  // altrimenti restano residui della sagoma precedente.
  const size = canvas ? `${canvas.width}x${canvas.height}` : ''
  const texture = useMemo(() => {
    if (!canvas) return null
    const t = new THREE.CanvasTexture(canvas)
    t.flipY = flipY // i pezzi hanno v = 0 in alto (collo, testa della manica)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
    return t
  }, [canvas, gl, size, flipY]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (texture) {
      texture.needsUpdate = true
      invalidate()
    }
  }, [texture, version, invalidate])
  useEffect(() => () => texture?.dispose(), [texture])
  return texture
}

export interface SleeveCanvas { canvas: HTMLCanvasElement; rect: [number, number, number, number]; anchor: [number, number]; full?: boolean }

function useSleeve(s: SleeveCanvas | null | undefined, version: number): SleeveTexture | null {
  const texture = usePanelTexture(s?.canvas ?? null, version)
  const rectKey = s ? `${s.rect.join(',')}|${s.anchor.join(',')}|${s.full ? 1 : 0}` : ''
  return useMemo(() => (texture && s ? { texture, rect: s.rect, anchor: s.anchor, full: !!s.full } : null), [texture, rectKey]) // eslint-disable-line react-hooks/exhaustive-deps
}

function Garment({ shape, front, back, version, view, baseColor, sleeves, pieces, trimColor }: {
  shape: ModelShape; front: HTMLCanvasElement | null; back: HTMLCanvasElement | null; version: number; view: 'front' | 'back'; baseColor: string
  sleeves?: { left?: SleeveCanvas | null; right?: SleeveCanvas | null }
  pieces?: PieceSet | null; trimColor?: string
}) {
  const model = useGarmentModel(shape)
  // pezzi del cartamodello (ricostruzione): una texture per pezzo
  const c = pieces?.canvases
  const pFront = usePanelTexture(c?.front ?? null, version, false)
  const pBack = usePanelTexture(c?.back ?? null, version, false)
  const pSleeveL = usePanelTexture(c?.sleeve_left ?? null, version, false)
  const pSleeveR = usePanelTexture(c?.sleeve_right ?? null, version, false)
  const pLegL = usePanelTexture(c?.leg_left ?? null, version, false)
  const pLegR = usePanelTexture(c?.leg_right ?? null, version, false)
  const pieceTextures = useMemo(() => {
    const t = { front: pFront, back: pBack, sleeve_left: pSleeveL, sleeve_right: pSleeveR, leg_left: pLegL, leg_right: pLegR }
    const out = Object.fromEntries(Object.entries(t).filter(([, v]) => v)) as Record<string, THREE.Texture>
    return Object.keys(out).length ? out : null
  }, [pFront, pBack, pSleeveL, pSleeveR, pLegL, pLegR])
  const sleeveLeft = useSleeve(sleeves?.left, version)
  const sleeveRight = useSleeve(sleeves?.right, version)
  const s = getShape(shape)
  const frontGeo = useMemo(() => buildPanelGeometry(s, 'front'), [s])
  const backGeo = useMemo(() => buildPanelGeometry(s, 'back'), [s])
  useEffect(() => () => { frontGeo.dispose(); backGeo.dispose() }, [frontGeo, backGeo])
  const frontTex = usePanelTexture(front, version)
  const backTex = usePanelTexture(back, version)
  const group = useRef<THREE.Group>(null)
  const { invalidate } = useThree()
  const target = view === 'front' ? 0 : Math.PI

  useEffect(() => invalidate(), [view, invalidate])
  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    const diff = target - g.rotation.y
    if (Math.abs(diff) > 0.001) {
      g.rotation.y += diff * Math.min(1, dt * 7)
      invalidate()
    } else g.rotation.y = target
  })

  return (
    <group ref={group} position={[0, -0.08, 0]}>
      {model.status === 'ready' && pieces && pieceTextures && hasPieceMeshes(model.geos, Object.keys(pieceTextures)) ? (
        <PieceGarment geos={model.geos} textures={pieceTextures} shapes={pieces.shapes} baseColor={baseColor} trimColor={trimColor ?? baseColor} />
      ) : model.status === 'ready' && frontTex && backTex ? (
        <ModelGarment shape={shape} geos={model.geos} front={frontTex} back={backTex} baseColor={baseColor} sleeveLeft={sleeveLeft} sleeveRight={sleeveRight} />
      ) : (
        <>
          <mesh geometry={frontGeo} castShadow>
            <meshStandardMaterial map={frontTex} alphaTest={0.5} alphaToCoverage side={THREE.DoubleSide} roughness={0.82} metalness={0} />
          </mesh>
          <mesh geometry={backGeo} rotation={[0, Math.PI, 0]}>
            <meshStandardMaterial map={backTex} alphaTest={0.5} alphaToCoverage side={THREE.DoubleSide} roughness={0.82} metalness={0} />
          </mesh>
        </>
      )}
    </group>
  )
}

/** Densità di pixel: piena da fermo (max 1,5), ridotta a 1 durante la rotazione per restare fluida. */
const DPR_IDLE = Math.min(1.5, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)

function Controls({ resetKey }: { resetKey: string }) {
  const { camera, gl, invalidate, setDpr } = useThree()
  const ref = useRef<OrbitControls | null>(null)
  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement)
    c.enablePan = false
    c.enableDamping = true
    c.dampingFactor = 0.08
    c.minDistance = 2.2
    c.maxDistance = 6
    c.minPolarAngle = Math.PI * 0.28
    c.maxPolarAngle = Math.PI * 0.72
    let idle = 0
    c.addEventListener('change', () => invalidate())
    c.addEventListener('start', () => { window.clearTimeout(idle); setDpr(1) })
    c.addEventListener('end', () => {
      // a rotazione terminata (smorzamento compreso) torna la risoluzione piena
      window.clearTimeout(idle)
      idle = window.setTimeout(() => { setDpr(DPR_IDLE); invalidate() }, 600)
    })
    ref.current = c
    return () => { window.clearTimeout(idle); c.dispose() }
  }, [camera, gl, invalidate, setDpr])
  useEffect(() => {
    // Cambio vista: riporta la camera in posizione frontale
    camera.position.set(0, 0.1, 3.9)
    ref.current?.target.set(0, 0, 0)
    ref.current?.update()
    invalidate()
  }, [resetKey, camera, invalidate])
  useFrame(() => {
    if (ref.current?.update()) invalidate()
  })
  return null
}

export interface GarmentViewerProps {
  shape: ModelShape
  front: HTMLCanvasElement | null
  back: HTMLCanvasElement | null
  version: number
  view: 'front' | 'back'
  /** Colore base del capo: usato sul modello 3D dove le grafiche non arrivano. */
  baseColor: string
  /** Elementi delle maniche (solo per i modelli 3D reali). */
  sleeves?: { left?: SleeveCanvas | null; right?: SleeveCanvas | null }
  resetToken?: number
  className?: string
  /** Pezzi del cartamodello già disegnati (ricostruzione del capo dai pezzi) e colore delle finiture. */
  pieces?: PieceSet | null
  trimColor?: string
}

export default function GarmentViewer({ shape, front, back, version, view, baseColor, sleeves, resetToken = 0, className, pieces, trimColor }: GarmentViewerProps) {
  return (
    <Canvas
      className={className}
      frameloop="demand"
      dpr={DPR_IDLE}
      camera={{ position: [0, 0.1, 3.9], fov: 35 }}
      gl={{ antialias: true, preserveDrawingBuffer: false, alpha: true }}
      aria-label="Anteprima 3D del prodotto configurato"
      role="img"
    >
      <hemisphereLight args={['#ffffff', '#8a8a92', 1.15]} />
      <directionalLight position={[2.5, 3, 4]} intensity={1.6} />
      <directionalLight position={[-3, 1.5, -3]} intensity={0.9} />
      <directionalLight position={[0, -2, 3]} intensity={0.25} />
      <Garment shape={shape} front={front} back={back} version={version} view={view} baseColor={baseColor} sleeves={sleeves} pieces={pieces} trimColor={trimColor} />
      <Controls resetKey={`${view}-${shape}-${resetToken}`} />
    </Canvas>
  )
}
