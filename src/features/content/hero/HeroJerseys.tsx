// Scena 3D dell'hero: le due maglie in vetrina, sospese, con luce da studio.
// Caricata in lazy: three.js non entra nel bundle iniziale della home.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { getShape } from '@/features/configurator/garment/shapes'
import { buildPanelGeometry } from '@/features/configurator/garment/geometry'
import { fabricNormalMap, paintJersey, type JerseyDesign, type JerseyTextures } from './jerseyDesigns'

const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function useTexture(canvas: HTMLCanvasElement) {
  const { gl } = useThree()
  const tex = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
    return t
  }, [canvas, gl])
  useEffect(() => () => tex.dispose(), [tex])
  return tex
}

function Studio() {
  const { gl, scene } = useThree()
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.32
    return () => {
      scene.environment = null
      env.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])
  return (
    <>
      <hemisphereLight args={['#f4efe6', '#1a1a20', 0.55]} />
      <directionalLight position={[3, 4, 5]} intensity={2.3} color="#fff3e2" />
      <directionalLight position={[-4, 2.5, -3]} intensity={3.4} color="#C2A063" />
      <directionalLight position={[4, -1, -4]} intensity={1.4} color="#9fb2d8" />
      <pointLight position={[-2.5, -1.5, 2.5]} intensity={3} color="#7d8fb5" distance={8} />
    </>
  )
}

interface JerseyProps {
  textures: JerseyTextures
  normal: THREE.Texture
  position: [number, number, number]
  baseYaw: number
  phase: number
  scale: number
}

function Jersey({ textures, normal, position, baseYaw, phase, scale }: JerseyProps) {
  const shape = getShape('tshirt')
  const frontGeo = useMemo(() => buildPanelGeometry(shape, 'front', 128, 0.55), [shape])
  const backGeo = useMemo(() => buildPanelGeometry(shape, 'back', 128, 0.55), [shape])
  useEffect(() => () => { frontGeo.dispose(); backGeo.dispose() }, [frontGeo, backGeo])
  const front = useTexture(textures.front)
  const back = useTexture(textures.back)
  const ref = useRef<THREE.Group>(null)

  useFrame(({ clock }) => {
    const g = ref.current
    if (!g) return
    const t = clock.elapsedTime + phase
    g.rotation.y = baseYaw + (reduceMotion ? 0 : Math.sin(t * 0.32) * 0.42)
    g.rotation.z = reduceMotion ? 0 : Math.sin(t * 0.5) * 0.025
    g.position.y = position[1] + (reduceMotion ? 0 : Math.sin(t * 0.8) * 0.045)
  })

  const material = (map: THREE.Texture) => (
    <meshPhysicalMaterial
      map={map}
      normalMap={normal}
      normalScale={new THREE.Vector2(0.28, 0.28)}
      alphaTest={0.5}
      side={THREE.DoubleSide}
      roughness={0.72}
      metalness={0}
      sheen={0.7}
      sheenRoughness={0.55}
      sheenColor="#ffffff"
      clearcoat={0.08}
      clearcoatRoughness={0.6}
    />
  )

  return (
    <group ref={ref} position={position} scale={scale}>
      <mesh geometry={frontGeo}>{material(front)}</mesh>
      <mesh geometry={backGeo} rotation={[0, Math.PI, 0]}>{material(back)}</mesh>
    </group>
  )
}

/** Trascinamento orizzontale per ruotare la composizione, con inerzia; parallasse col puntatore. */
function Rig({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  const { gl, size } = useThree()
  const state = useRef({ yaw: 0, vel: 0, dragging: false, lastX: 0, px: 0, py: 0 })

  useEffect(() => {
    const el = gl.domElement
    const s = state.current
    const down = (e: PointerEvent) => {
      s.dragging = true
      s.lastX = e.clientX
      el.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      s.px = ((e.clientX - r.left) / r.width) * 2 - 1
      s.py = ((e.clientY - r.top) / r.height) * 2 - 1
      if (!s.dragging) return
      const dx = e.clientX - s.lastX
      s.lastX = e.clientX
      s.vel = dx * 0.006
      s.yaw += s.vel
    }
    const up = () => { s.dragging = false }
    const leave = () => { s.px = 0; s.py = 0 }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('pointerleave', leave)
    }
  }, [gl])

  useFrame((_, dt) => {
    const g = ref.current
    const s = state.current
    if (!g) return
    if (!s.dragging) {
      s.vel *= Math.pow(0.04, dt)
      s.yaw += s.vel
      // ritorno morbido verso la posa frontale
      s.yaw += (Math.round(s.yaw / (Math.PI * 2)) * Math.PI * 2 - s.yaw) * Math.min(1, dt * 0.6)
    }
    g.rotation.y += (s.yaw + s.px * 0.18 - g.rotation.y) * Math.min(1, dt * 6)
    g.rotation.x += (s.py * 0.06 - g.rotation.x) * Math.min(1, dt * 4)
  })

  // La composizione (circa 3,3 unità di larghezza) deve stare tutta nell'inquadratura
  const visibleW = 2 * 5.6 * Math.tan((32 / 2) * (Math.PI / 180)) * (size.width / size.height)
  const fit = Math.min(1, visibleW / 3.35)
  return <group ref={ref} position={[0.06, -0.04, 0]} scale={fit}>{children}</group>
}

function Scene({ lupo, splash }: { lupo: JerseyTextures; splash: JerseyTextures }) {
  const normal = useMemo(() => {
    const t = new THREE.CanvasTexture(fabricNormalMap())
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(48, 40)
    return t
  }, [])
  useEffect(() => () => normal.dispose(), [normal])
  return (
    <>
      <Studio />
      <Rig>
        <Jersey textures={splash} normal={normal} position={[-0.62, 0.22, -1]} baseYaw={0.38} phase={2.1} scale={0.98} />
        <Jersey textures={lupo} normal={normal} position={[0.42, -0.06, 0.25]} baseYaw={-0.22} phase={0} scale={1} />
      </Rig>
    </>
  )
}

export default function HeroJerseys({ className, onReady }: { className?: string; onReady?: () => void }) {
  const [tex, setTex] = useState<{ lupo: JerseyTextures; splash: JerseyTextures } | null>(null)
  const [active, setActive] = useState(true)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    Promise.all([paintJersey('lupo'), paintJersey('splash')]).then(([lupo, splash]) => {
      if (alive) setTex({ lupo, splash })
    })
    return () => { alive = false }
  }, [])

  // Nessun rendering quando la scena è fuori schermo
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setActive(e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={wrap} className={className}>
      {tex && (
        <Canvas
          frameloop={active ? 'always' : 'never'}
          dpr={[1, 1.75]}
          camera={{ position: [0, 0.05, 5.6], fov: 32 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.NeutralToneMapping
            gl.toneMappingExposure = 1.05
            onReady?.()
          }}
          className="touch-pan-y cursor-grab active:cursor-grabbing"
          aria-label="Modelli 3D di due maglie da gara personalizzate"
          role="img"
        >
          <Scene lupo={tex.lupo} splash={tex.splash} />
        </Canvas>
      )}
    </div>
  )
}

export type { JerseyDesign }
