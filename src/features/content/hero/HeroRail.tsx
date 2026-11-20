// Hero: le due maglie, come oggetti 3D pieni, appese a uno stender sospeso.
//
// · Ogni maglia è un volume (volume.ts) con il render originale sul fronte e il retro
//   ricostruito sul dorso; la gruccia sta dentro la maglia, esce solo il gancio.
// · Fisica delle grucce: pendolo sull'asta. Trascinando una maglia la si fa scorrere,
//   spinge l'altra e, rilasciata, oscilla e torna al suo posto.
// · Il tessuto segue il movimento con un ritardo calcolato nel vertex shader (l'orlo
//   "resta indietro" quando la gruccia oscilla) e una leggera corrente d'aria.
// · Al passaggio la maglia si gira verso chi guarda; un clic la solleva e mostra il retro.
// · Il bagliore che segue il puntatore è disegnato solo sul tessuto.
// Caricata in lazy: three.js non entra nel bundle iniziale.

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { buildVolume, NECK_Y, opaqueAt, type AlphaMap, type JerseyVolume } from './volume'

export const HERO_JERSEYS = [
  { id: 'splash', front: '/hero/splash-front.webp', back: '/hero/splash-back.webp', restYaw: 0.45 },
  { id: 'lupo', front: '/hero/lupo-front.webp', back: '/hero/lupo-back.webp', restYaw: -0.35 },
] as const

const JERSEY_W = 1.72
const SPACING = 1.62
const RAIL_Y = 1.32
const CAM = { z: 6.4, fov: 30, y: 0.08 }
const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

interface Loaded { front: THREE.Texture; back: THREE.Texture; alpha: AlphaMap; volume: JerseyVolume }

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

async function loadJersey(front: string, back: string, maxAniso: number): Promise<Loaded> {
  const [f, b] = await Promise.all([loadImage(front), loadImage(back)])
  const c = document.createElement('canvas')
  c.width = 256
  c.height = Math.round(256 * (f.naturalHeight / f.naturalWidth))
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(f, 0, 0, c.width, c.height)
  const alpha = { data: ctx.getImageData(0, 0, c.width, c.height).data, width: c.width, height: c.height }
  const tex = (img: HTMLImageElement) => {
    const t = new THREE.Texture(img)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = maxAniso
    t.needsUpdate = true
    return t
  }
  return { front: tex(f), back: tex(b), alpha, volume: buildVolume(alpha, JERSEY_W) }
}

interface Motion {
  glowPos: { value: THREE.Vector2 }
  glow: { value: number }
  sway: { value: THREE.Vector2 }
  time: { value: number }
}

/** Tessuto: luce morbida, ritardo dell'orlo nel vertex shader, bagliore dorato al puntatore. */
function fabricMaterial(map: THREE.Texture, motion: Motion, height: number) {
  const m = new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.82, metalness: 0, envMapIntensity: 0.9 })
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uGlowPos: motion.glowPos, uGlow: motion.glow, uSway: motion.sway, uTime: motion.time })
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uSway;\nuniform float uTime;\nvarying vec2 vNmPos;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vNmPos = position.xy;
        float nmH = clamp((${NECK_Y.toFixed(3)} - position.y) / ${height.toFixed(3)}, 0.0, 1.0);
        float nmH2 = nmH * nmH;
        transformed.x -= uSway.x * 0.075 * nmH2;
        transformed.z += (sin(uTime * 1.25 + position.y * 2.4 + position.x * 1.3) * 0.012 - uSway.y * 0.06) * nmH2;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uGlowPos;\nuniform float uGlow;\nvarying vec2 vNmPos;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float nmD = distance(vNmPos, uGlowPos);
        totalEmissiveRadiance += vec3(0.76, 0.63, 0.39) * uGlow * (0.42 * exp(-nmD * nmD / 0.045) + 0.1 * exp(-nmD * nmD / 0.45));`,
      )
  }
  return m
}

interface HangerState {
  s: number; vs: number; slot: number; dragTo: number
  swing: number; vswing: number
  tilt: number; vtilt: number
  yaw: number; vyaw: number
  lift: number; vlift: number
  hovered: boolean; flipped: boolean; dragging: boolean
}

/** Stender sospeso: asta con terminali e due tiranti verso il soffitto. */
function Rail({ length }: { length: number }) {
  return (
    <group position={[0, RAIL_Y, 0]}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.026, 0.026, length, 24]} />
        <meshStandardMaterial color="#2c2c32" metalness={1} roughness={0.3} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side} position={[(side * length) / 2, 0, 0]}>
          <mesh>
            <sphereGeometry args={[0.042, 20, 16]} />
            <meshStandardMaterial color="#2c2c32" metalness={1} roughness={0.3} />
          </mesh>
          <mesh position={[0, 2, 0]}>
            <cylinderGeometry args={[0.009, 0.009, 4, 10]} />
            <meshStandardMaterial color="#C2A063" metalness={1} roughness={0.35} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** Gruccia dentro la maglia (più stretta delle spalle) e gancio dorato che esce dal collo. */
function Hanger({ volume }: { volume: JerseyVolume }) {
  const { bar, hook } = useMemo(() => {
    const span = volume.width * 0.29
    const pts = Array.from({ length: 13 }, (_, i) => {
      const x = -span + (i / 12) * span * 2
      return new THREE.Vector3(x, Math.min(volume.shoulder(x), NECK_Y) - 0.075, 0)
    })
    const bar = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.022, 10, false)
    const hookPts = [
      new THREE.Vector3(0, NECK_Y - 0.06, 0),
      new THREE.Vector3(0, -0.12, 0.012),
      new THREE.Vector3(0, -0.05, 0.05),
      ...Array.from({ length: 9 }, (_, i) => {
        const a = (i / 8) * Math.PI
        return new THREE.Vector3(0, Math.sin(a) * 0.05, Math.cos(a) * 0.05)
      }),
      new THREE.Vector3(0, -0.035, -0.055),
    ]
    const hook = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hookPts), 48, 0.0085, 8, false)
    return { bar, hook }
  }, [volume])
  useEffect(() => () => { bar.dispose(); hook.dispose() }, [bar, hook])
  return (
    <>
      <mesh geometry={bar}><meshStandardMaterial color="#141417" roughness={0.55} metalness={0.2} /></mesh>
      <mesh geometry={hook}><meshStandardMaterial color="#C2A063" roughness={0.28} metalness={1} /></mesh>
    </>
  )
}

/** Posizione libera (mobile): centro della maglia e scala, in coordinate del mondo. */
interface FloatLayout { x: number; y: number; scale: number }

function Jersey({ data, state, index, layout, hanger = true }: { data: Loaded; state: HangerState; index: number; layout?: FloatLayout | null; hanger?: boolean }) {
  const motion = useMemo<Motion>(() => ({
    glowPos: { value: new THREE.Vector2(0, -99) }, glow: { value: 0 }, sway: { value: new THREE.Vector2() }, time: { value: 0 },
  }), [])
  const { volume } = data
  const front = useMemo(() => fabricMaterial(data.front, motion, volume.height), [data, motion, volume])
  const back = useMemo(() => fabricMaterial(data.back, motion, volume.height), [data, motion, volume])
  useEffect(() => () => { front.dispose(); back.dispose() }, [front, back])

  const ref = useRef<THREE.Group>(null)
  const pointer = useRef({ active: false, glow: 0 })
  const { gl } = useThree()
  const euler = useMemo(() => new THREE.Euler(0, 0, 0, 'YXZ'), [])

  useFrame(({ clock }, delta) => {
    const g = ref.current
    if (!g) return
    if (layout) {
      // sospesa a mezz'aria: leggero galleggiamento attorno al punto assegnato
      const bob = reduceMotion ? 0 : Math.sin(clock.elapsedTime * 0.9 + index * 2.1) * 0.035
      g.position.set(layout.x, layout.y + (state.lift + bob) * layout.scale, 0)
      g.scale.setScalar(layout.scale)
    } else g.position.set(state.s, RAIL_Y + state.lift, 0)
    euler.set(state.tilt, state.yaw, state.swing)
    g.quaternion.setFromEuler(euler)
    const p = pointer.current
    p.glow += ((p.active ? 1 : 0) - p.glow) * Math.min(1, delta * 7)
    motion.glow.value = p.glow
    motion.sway.value.set(state.vswing, state.vtilt)
    motion.time.value = reduceMotion ? 0 : clock.elapsedTime + index * 2.7
  })

  // Interazione su un piano invisibile (2 triangoli) invece che sulla mesh completa
  const hit = (e: ThreeEvent<PointerEvent>) => !!e.uv && opaqueAt(data.alpha, e.uv.x, e.uv.y)
  const leave = () => {
    pointer.current.active = false
    state.hovered = false
    if (!state.dragging) gl.domElement.style.cursor = ''
  }
  const move = (e: ThreeEvent<PointerEvent>) => {
    if (!hit(e)) return leave()
    e.stopPropagation()
    const local = ref.current!.worldToLocal(e.point.clone())
    motion.glowPos.value.set(local.x, local.y)
    pointer.current.active = true
    state.hovered = true
    gl.domElement.style.cursor = state.dragging ? 'grabbing' : 'grab'
  }

  return (
    <group ref={ref}>
      {hanger && <Hanger volume={volume} />}
      <mesh geometry={volume.front} material={front} />
      <mesh geometry={volume.back} material={back} />
      <mesh
        position={[0, NECK_Y - volume.height / 2, 0]}
        onPointerMove={move}
        onPointerOut={leave}
        onPointerDown={(e) => {
          if (!hit(e)) return
          e.stopPropagation()
          window.dispatchEvent(new CustomEvent('nm:hanger-down', { detail: { index, x: e.clientX, id: e.pointerId } }))
        }}
      >
        <planeGeometry args={[volume.width, volume.height]} />
        <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function Rig({ jerseys }: { jerseys: Loaded[] }) {
  const { size, gl } = useThree()
  const visibleH = 2 * CAM.z * Math.tan((CAM.fov / 2) * (Math.PI / 180))
  const visibleW = visibleH * (size.width / size.height)
  const span = SPACING * (HERO_JERSEYS.length - 1) + JERSEY_W
  const scale = Math.min(1.1, visibleW / (span + 0.8), (visibleH * 0.84) / 2.45)
  const railWorldY = CAM.y + (2.3 * scale) / 2 + 0.02

  const states = useRef<HangerState[]>(
    HERO_JERSEYS.map((j, i) => {
      const slot = (i - (HERO_JERSEYS.length - 1) / 2) * SPACING
      return { s: slot, vs: 0, slot, dragTo: slot, swing: 0, vswing: 0, tilt: 0, vtilt: 0, yaw: j.restYaw, vyaw: 0, lift: 0, vlift: 0, hovered: false, flipped: false, dragging: false }
    }),
  )
  const drag = useRef<{ index: number; startX: number; startS: number; moved: boolean } | null>(null)

  useEffect(() => {
    const el = gl.domElement
    const worldPerPx = () => visibleW / scale / el.clientWidth
    const down = (ev: Event) => {
      const { index, x, id } = (ev as CustomEvent).detail
      const st = states.current[index]
      drag.current = { index, startX: x, startS: st.s, moved: false }
      st.dragging = true
      st.dragTo = st.s
      try { el.setPointerCapture(id) } catch { /* puntatore già rilasciato */ }
      el.style.cursor = 'grabbing'
    }
    const move = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      const dx = e.clientX - d.startX
      if (Math.abs(dx) > 5) d.moved = true
      states.current[d.index].dragTo = THREE.MathUtils.clamp(d.startS + dx * worldPerPx(), -3, 3)
    }
    const up = () => {
      const d = drag.current
      if (!d) return
      const st = states.current[d.index]
      st.dragging = false
      if (!d.moved) {
        st.flipped = !st.flipped
        st.vlift += 1.2
      }
      drag.current = null
      el.style.cursor = st.hovered ? 'grab' : ''
    }
    window.addEventListener('nm:hanger-down', down)
    el.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('blur', up)
    return () => {
      window.removeEventListener('nm:hanger-down', down)
      el.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('blur', up)
    }
  }, [gl, visibleW, scale])

  // Fisica delle grucce: pendolo sull'asta e molle verso la posizione di riposo
  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const list = states.current
    list.forEach((st, i) => {
      const prevVs = st.vs
      if (st.dragging) {
        const ns = st.s + (st.dragTo - st.s) * Math.min(1, dt * 12)
        st.vs = (ns - st.s) / Math.max(dt, 1e-3)
        st.s = ns
      } else {
        st.vs += ((st.slot - st.s) * 8 - st.vs * 3.4) * dt
        st.s += st.vs * dt
      }
      const acc = THREE.MathUtils.clamp((st.vs - prevVs) / Math.max(dt, 1e-3), -24, 24)
      const L = 1.3
      st.vswing += (-(9.8 / L) * Math.sin(st.swing) - (acc / L) * Math.cos(st.swing) * 0.32 - st.vswing * 2.2) * dt
      st.swing = THREE.MathUtils.clamp(st.swing + st.vswing * dt, -0.38, 0.38)
      const breeze = reduceMotion ? 0 : Math.sin(clock.elapsedTime * 0.55 + i * 2) * 0.03
      st.vtilt += ((breeze - st.tilt) * 10 - st.vtilt * 2.4) * dt
      st.tilt += st.vtilt * dt
      const yawTarget = (st.flipped ? Math.PI : 0) + (st.hovered || st.dragging || st.flipped ? 0 : HERO_JERSEYS[i].restYaw)
      st.vyaw += ((yawTarget - st.yaw) * 12 - st.vyaw * 5) * dt
      st.yaw += st.vyaw * dt
      const liftTarget = st.flipped ? 0.1 : 0
      st.vlift += ((liftTarget - st.lift) * 40 - st.vlift * 7) * dt
      st.lift += st.vlift * dt
    })
    // le grucce si spingono lungo l'asta
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i], b = list[i + 1]
      const gap = b.s - a.s - JERSEY_W * 0.68
      if (gap >= 0) continue
      const wa = a.dragging ? 0 : 1, wb = b.dragging ? 0 : 1
      if (!wa && !wb) continue
      a.s += (gap * wa) / (wa + wb)
      b.s -= (gap * wb) / (wa + wb)
      const rel = b.vs - a.vs
      if (rel < 0) {
        if (wa) a.vs += (rel * wa) / (wa + wb)
        if (wb) b.vs -= (rel * wb) / (wa + wb)
      }
    }
  })

  return (
    <group position={[0, railWorldY - RAIL_Y * scale, 0]} scale={scale}>
      <Rail length={span + 0.5} />
      {jerseys.map((j, i) => <Jersey key={HERO_JERSEYS[i].id} data={j} state={states.current[i]} index={i} />)}
    </group>
  )
}

/**
 * Mobile e tablet: niente stender. Ogni maglia resta sospesa in un punto dell'hero,
 * allineata a un segnaposto nel testo; si ruota trascinando, un tocco mostra il retro.
 */
function Floaters({ jerseys, anchors }: { jerseys: Loaded[]; anchors: RefObject<HTMLElement | null>[] }) {
  const { gl } = useThree()
  const [layouts, setLayouts] = useState<(FloatLayout | null)[]>([])
  const states = useRef<HangerState[]>(
    HERO_JERSEYS.map((j) => ({ s: 0, vs: 0, slot: 0, dragTo: 0, swing: 0, vswing: 0, tilt: 0, vtilt: 0, yaw: j.restYaw * 0.6, vyaw: 0, lift: 0, vlift: 0, hovered: false, flipped: false, dragging: false })),
  )
  const drag = useRef<{ index: number; lastX: number; lastT: number; moved: boolean; total: number } | null>(null)

  // Allinea ogni maglia al suo segnaposto
  useEffect(() => {
    const visibleH = 2 * CAM.z * Math.tan((CAM.fov / 2) * (Math.PI / 180))
    const measure = () => {
      const c = gl.domElement.getBoundingClientRect()
      if (!c.width || !c.height) return
      const visibleW = visibleH * (c.width / c.height)
      setLayouts(anchors.map((ref, i) => {
        const r = ref.current?.getBoundingClientRect()
        if (!r || !r.width || !r.height) return null
        const { width: w, height: h } = jerseys[i].volume
        const scale = Math.min(((r.height / c.height) * visibleH) / h, ((r.width / c.width) * visibleW) / w)
        const cx = (r.left + r.width / 2 - c.left) / c.width
        const cy = (r.top + r.height / 2 - c.top) / c.height
        return { x: (cx - 0.5) * visibleW, y: (0.5 - cy) * visibleH + CAM.y + (-NECK_Y + h / 2) * scale, scale }
      }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(gl.domElement)
    anchors.forEach((a) => a.current && ro.observe(a.current))
    return () => ro.disconnect()
  }, [gl, anchors, jerseys])

  // Trascinamento orizzontale = rotazione con inerzia; tocco = retro
  useEffect(() => {
    const el = gl.domElement
    const down = (ev: Event) => {
      const { index, x } = (ev as CustomEvent).detail
      drag.current = { index, lastX: x, lastT: performance.now(), moved: false, total: 0 }
      states.current[index].dragging = true
    }
    const move = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      const dx = e.clientX - d.lastX
      const now = performance.now()
      d.total += Math.abs(dx)
      if (d.total > 6) d.moved = true
      const st = states.current[d.index]
      st.yaw += dx * 0.013
      st.vyaw = (dx * 0.013) / Math.max(0.008, (now - d.lastT) / 1000)
      d.lastX = e.clientX
      d.lastT = now
    }
    const up = () => {
      const d = drag.current
      if (!d) return
      const st = states.current[d.index]
      st.dragging = false
      if (!d.moved) {
        st.flipped = !st.flipped
        st.vlift += 1.2
      }
      drag.current = null
    }
    window.addEventListener('nm:hanger-down', down)
    el.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('nm:hanger-down', down)
      el.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [gl])

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 1 / 30)
    states.current.forEach((st, i) => {
      if (!st.dragging) {
        // torna alla posa più vicina (fronte o retro) dopo aver girato per inerzia
        const base = HERO_JERSEYS[i].restYaw * 0.6 + (st.flipped ? Math.PI : 0)
        const target = base + Math.PI * 2 * Math.round((st.yaw - base) / (Math.PI * 2))
        st.vyaw += ((target - st.yaw) * 5 - st.vyaw * 2.6) * dt
        st.yaw += st.vyaw * dt
      }
      const breeze = reduceMotion ? 0 : Math.sin(clock.elapsedTime * 0.7 + i * 1.7) * 0.05
      st.vswing += ((breeze - st.swing) * 8 - st.vswing * 2) * dt
      st.swing += st.vswing * dt
      const tiltTarget = reduceMotion ? 0 : Math.sin(clock.elapsedTime * 0.5 + i) * 0.04
      st.vtilt += ((tiltTarget - st.tilt) * 8 - st.vtilt * 2.2) * dt
      st.tilt += st.vtilt * dt
      st.vlift += (((st.flipped ? 0.08 : 0) - st.lift) * 40 - st.vlift * 7) * dt
      st.lift += st.vlift * dt
    })
  })

  return (
    <>
      {jerseys.map((j, i) => layouts[i] && (
        <Jersey key={HERO_JERSEYS[i].id} data={j} state={states.current[i]} index={i} layout={layouts[i]} hanger={false} />
      ))}
    </>
  )
}

function Studio() {
  const { gl, scene } = useThree()
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.45
    return () => {
      scene.environment = null
      env.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])
  return (
    <>
      <hemisphereLight args={['#f4efe6', '#24242a', 0.9]} />
      <directionalLight position={[2.5, 3.5, 5]} intensity={1.5} color="#fff4e6" />
      <directionalLight position={[-4, 2, -3]} intensity={2.2} color="#C2A063" />
      <directionalLight position={[-3, 0.5, 3]} intensity={0.5} color="#b8c6e0" />
    </>
  )
}

export default function HeroRail({ className, onReady, anchors }: {
  className?: string
  onReady?: () => void
  /** Su mobile: segnaposto nel testo dove far fluttuare le maglie (niente stender). */
  anchors?: RefObject<HTMLElement | null>[]
}) {
  const [jerseys, setJerseys] = useState<Loaded[] | null>(null)
  const [active, setActive] = useState(true)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setActive(e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={wrap} className={className}>
      <Canvas
        frameloop={active ? 'always' : 'never'}
        dpr={[1, 1.5]}
        camera={{ position: [0, CAM.y, CAM.z], fov: CAM.fov }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.NeutralToneMapping
          gl.toneMappingExposure = 1.05
          const aniso = Math.min(8, gl.capabilities.getMaxAnisotropy())
          Promise.all(HERO_JERSEYS.map((j) => loadJersey(j.front, j.back, aniso))).then((list) => {
            setJerseys(list)
            requestAnimationFrame(() => onReady?.())
          })
        }}
        className="touch-pan-y"
        aria-label={anchors ? 'Due maglie da gara personalizzate in 3D: trascina per ruotarle, tocca per vedere il retro' : 'Due maglie da gara personalizzate appese a uno stender: trascina per spostarle, clic per vedere il retro'}
        role="img"
      >
        <Studio />
        {jerseys && (anchors ? <Floaters jerseys={jerseys} anchors={anchors} /> : <Rig jerseys={jerseys} />)}
      </Canvas>
    </div>
  )
}
