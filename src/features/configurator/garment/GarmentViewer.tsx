// Mockup 3D live del capo (React Three Fiber). Caricato in lazy solo nel configuratore.
//
// La mesh è generata dalla sagoma: due superfici (fronte/retro) a "cuscino" la cui
// profondità dipende dalla distanza dal bordo, ritagliate con alphaTest sulla texture.
// Leggero (nessun modello da scaricare) e coerente con le aree definite dall'admin.

import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { ModelShape } from '@/types/db'
import { distanceToPolygon, getShape, pointInPolygon, type GarmentShape } from './shapes'

const TARGET_WIDTH = 2.2

function buildPanelGeometry(shape: GarmentShape, side: 'front' | 'back', segX = 96) {
  const { minX, maxX, minY, maxY } = shape.bounds
  const W = maxX - minX
  const H = maxY - minY
  const segY = Math.round((segX * H) / W)
  const geo = new THREE.PlaneGeometry(W, H, segX, segY)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const poly = side === 'front' ? shape.front : shape.back
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const R = W * 0.17
  const B = W * shape.bulge
  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i) + cx
    const sy = pos.getY(i) + cy
    let z = 0
    if (pointInPolygon(sx, sy, poly)) {
      const t = Math.min(distanceToPolygon(sx, sy, poly) / R, 1)
      z = B * Math.sqrt(1 - (1 - t) * (1 - t))
    }
    pos.setZ(i, z)
  }
  geo.computeVertexNormals()
  const s = TARGET_WIDTH / W
  geo.scale(s, s, s)
  return geo
}

function usePanelTexture(canvas: HTMLCanvasElement | null, version: number) {
  const { gl, invalidate } = useThree()
  const texture = useMemo(() => {
    if (!canvas) return null
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
    return t
  }, [canvas, gl])
  useEffect(() => {
    if (texture) {
      texture.needsUpdate = true
      invalidate()
    }
  }, [texture, version, invalidate])
  useEffect(() => () => texture?.dispose(), [texture])
  return texture
}

function Garment({ shape, front, back, version, view }: {
  shape: ModelShape; front: HTMLCanvasElement | null; back: HTMLCanvasElement | null; version: number; view: 'front' | 'back'
}) {
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
      <mesh geometry={frontGeo} castShadow>
        <meshStandardMaterial map={frontTex} alphaTest={0.5} alphaToCoverage side={THREE.DoubleSide} roughness={0.82} metalness={0} />
      </mesh>
      <mesh geometry={backGeo} rotation={[0, Math.PI, 0]}>
        <meshStandardMaterial map={backTex} alphaTest={0.5} alphaToCoverage side={THREE.DoubleSide} roughness={0.82} metalness={0} />
      </mesh>
    </group>
  )
}

function Controls({ resetKey }: { resetKey: string }) {
  const { camera, gl, invalidate } = useThree()
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
    c.addEventListener('change', () => invalidate())
    ref.current = c
    return () => c.dispose()
  }, [camera, gl, invalidate])
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
  resetToken?: number
  className?: string
}

export default function GarmentViewer({ shape, front, back, version, view, resetToken = 0, className }: GarmentViewerProps) {
  return (
    <Canvas
      className={className}
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ position: [0, 0.1, 3.9], fov: 35 }}
      gl={{ antialias: true, preserveDrawingBuffer: false, alpha: true }}
      aria-label="Anteprima 3D del prodotto configurato"
      role="img"
    >
      <hemisphereLight args={['#ffffff', '#8a8a92', 1.15]} />
      <directionalLight position={[2.5, 3, 4]} intensity={1.6} />
      <directionalLight position={[-3, 1.5, -3]} intensity={0.9} />
      <directionalLight position={[0, -2, 3]} intensity={0.25} />
      <Garment shape={shape} front={front} back={back} version={version} view={view} />
      <Controls resetKey={`${view}-${shape}-${resetToken}`} />
    </Canvas>
  )
}
