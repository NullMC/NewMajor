// Texture delle due maglie dell'hero, ricostruite dalle divise in vetrina:
// · "Lupo": blu ardesia con trama tono su tono di teste di lupo, collo con allacciatura,
//   banda verticale bianco/rosso/bianco sul fianco e polsini rossi con filetto bianco.
// · "Splash": verde acqua con macchie di colore, collo e polsini bianchi, logo New Major.
// Gli sponsor e gli stemmi delle squadre non sono riprodotti.
// Le texture usano la stessa sagoma del configuratore, quindi si applicano alla stessa mesh.

import { getShape, toCanvas, type GarmentShape, type Pt } from '@/features/configurator/garment/shapes'
import { panelSize } from '@/features/configurator/garment/panel'

export type JerseyDesign = 'lupo' | 'splash'
export interface JerseyTextures { front: HTMLCanvasElement; back: HTMLCanvasElement }

const WIDTH = 1280

interface Painter {
  ctx: CanvasRenderingContext2D
  shape: GarmentShape
  w: number
  h: number
  /** px per unità della sagoma */
  k: number
  P: (x: number, y: number) => Pt
}

function painter(canvas: HTMLCanvasElement): Painter {
  const shape = getShape('tshirt')
  const { width: w, height: h } = panelSize(shape, WIDTH)
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const k = w / (shape.bounds.maxX - shape.bounds.minX)
  return { ctx, shape, w, h, k, P: (x, y) => toCanvas([x, y], shape.bounds, w, h) }
}

function poly(p: Painter, pts: Pt[], close = true) {
  const { ctx } = p
  ctx.beginPath()
  pts.forEach(([x, y], i) => {
    const [cx, cy] = p.P(x, y)
    if (i) ctx.lineTo(cx, cy)
    else ctx.moveTo(cx, cy)
  })
  if (close) ctx.closePath()
}

/** PRNG deterministico: il disegno è identico a ogni caricamento. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fascia lungo il polsino, verso l'interno della manica. */
function cuffBand(p: Painter, a: Pt, b: Pt, from: number, to: number) {
  const vx = b[0] - a[0], vy = b[1] - a[1]
  const l = Math.hypot(vx, vy)
  const ux = vx / l, uy = vy / l
  // normale verso il corpo (x minore in valore assoluto)
  let nx = -uy, ny = ux
  if (Math.sign(nx) === Math.sign(a[0])) { nx = -nx; ny = -ny }
  const ext = 3
  const A: Pt = [a[0] - ux * ext, a[1] - uy * ext]
  const B: Pt = [b[0] + ux * ext, b[1] + uy * ext]
  poly(p, [
    [A[0] + nx * from, A[1] + ny * from], [B[0] + nx * from, B[1] + ny * from],
    [B[0] + nx * to, B[1] + ny * to], [A[0] + nx * to, A[1] + ny * to],
  ])
  p.ctx.fill()
}

function strokeTrim(p: Painter, pts: Pt[], color: string, width: number) {
  const { ctx } = p
  poly(p, pts, false)
  ctx.strokeStyle = color
  ctx.lineWidth = width * p.k
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke()
}

/** Ombre morbide ai bordi e luce centrale, per dare volume anche alla texture. */
function finish(p: Painter, outline: Pt[]) {
  const { ctx, w, h, k } = p
  const g = ctx.createRadialGradient(w * 0.5, h * 0.42, w * 0.05, w * 0.5, h * 0.5, w * 0.62)
  g.addColorStop(0, 'rgba(255,255,255,0.06)')
  g.addColorStop(1, 'rgba(0,0,0,0.16)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  poly(p, outline)
  ctx.lineWidth = 3.2 * k
  ctx.strokeStyle = 'rgba(0,0,0,0.14)'
  ctx.stroke()
  ctx.lineWidth = 1 * k
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'
  ctx.stroke()
}

// ── Lupo ──────────────────────────────────────────────────────────────

const LUPO = { base: '#37445B', dark: '#2E384B', tone: '#4B5A75', red: '#D8322E', white: '#F1F1EE' }

/** Testa di lupo stilizzata, coordinate locali in [-0.5, 0.5], y verso il basso. */
const WOLF: Pt[] = [
  [-0.34, -0.5], [-0.15, -0.21], [0, -0.27], [0.15, -0.21], [0.34, -0.5], [0.41, -0.1], [0.5, 0.1], [0.36, 0.14],
  [0.44, 0.29], [0.22, 0.34], [0.1, 0.5], [0, 0.55], [-0.1, 0.5], [-0.22, 0.34], [-0.44, 0.29], [-0.36, 0.14], [-0.5, 0.1], [-0.41, -0.1],
]

function wolfPattern(p: Painter) {
  const { ctx, w, h, k } = p
  const size = 8.4 * k
  const stepX = size * 1.25, stepY = size * 1.18
  ctx.lineJoin = 'round'
  for (let row = -1, y = -size; y < h + size; row++, y += stepY) {
    for (let x = (row % 2 ? stepX / 2 : 0) - size; x < w + size; x += stepX) {
      const path = (pts: Pt[]) => {
        ctx.beginPath()
        pts.forEach(([px, py], i) => (i ? ctx.lineTo(x + px * size, y + py * size) : ctx.moveTo(x + px * size, y + py * size)))
        ctx.closePath()
      }
      path(WOLF)
      ctx.fillStyle = 'rgba(26,33,46,0.18)'
      ctx.fill()
      ctx.lineWidth = size * 0.035
      ctx.strokeStyle = 'rgba(120,136,165,0.2)'
      ctx.stroke()
      // occhi e muso
      ctx.fillStyle = 'rgba(140,155,185,0.22)'
      for (const s of [-1, 1]) {
        path([[s * 0.05, 0.0], [s * 0.25, -0.05], [s * 0.17, 0.06]])
        ctx.fill()
      }
      ctx.beginPath()
      ctx.moveTo(x, y - 0.27 * size)
      ctx.lineTo(x, y + 0.1 * size)
      ctx.moveTo(x - 0.09 * size, y + 0.06 * size)
      ctx.lineTo(x - 0.05 * size, y + 0.36 * size)
      ctx.moveTo(x + 0.09 * size, y + 0.06 * size)
      ctx.lineTo(x + 0.05 * size, y + 0.36 * size)
      ctx.stroke()
      path([[-0.07, 0.36], [0.07, 0.36], [0, 0.44]])
      ctx.fill()
    }
  }
}

function lupoStripe(p: Painter, mirror: number) {
  const { ctx } = p
  // da sinistra verso destra (vista frontale): filetto bianco, rosso, bianco largo
  const bands: [number, number, string][] = [[13.4, 14.5, LUPO.white], [14.5, 18.9, LUPO.red], [18.9, 21.6, LUPO.white]]
  for (const [a, b, color] of bands) {
    const x0 = a * mirror, x1 = b * mirror
    poly(p, [[x0 - 0.6 * mirror, 82], [x1 - 0.6 * mirror, 82], [x1, -14], [x0, -14]])
    ctx.fillStyle = color
    ctx.fill()
  }
}

function paintLupo(canvas: HTMLCanvasElement, side: 'front' | 'back') {
  const p = painter(canvas)
  const { ctx, shape, w, h, k } = p
  const outline = side === 'front' ? shape.front : shape.back
  const trims = side === 'front' ? shape.trims.front : shape.trims.back
  ctx.clearRect(0, 0, w, h)
  ctx.save()
  poly(p, outline)
  ctx.clip()
  ctx.fillStyle = LUPO.base
  ctx.fillRect(0, 0, w, h)
  wolfPattern(p)
  // Banda sul fianco sinistro di chi indossa: a destra nella vista frontale, a sinistra da dietro
  lupoStripe(p, side === 'front' ? 1 : -1)
  // Polsini rossi con filetto bianco
  for (const cuff of trims.slice(1)) {
    ctx.fillStyle = LUPO.red
    cuffBand(p, cuff[0], cuff[1], -2, 4.2)
    ctx.fillStyle = LUPO.white
    cuffBand(p, cuff[0], cuff[1], 2.6, 3.4)
  }
  // Collo a costine
  strokeTrim(p, trims[0], LUPO.dark, 3.2)
  strokeTrim(p, trims[0], 'rgba(255,255,255,0.08)', 0.5)
  if (side === 'front') {
    // Scollo con allacciatura: fessura, occhielli e laccio incrociato
    const top = 68.6, bottom = 58.8
    poly(p, [[-1.9, top], [1.9, top], [0, bottom]])
    ctx.fillStyle = '#1F2633'
    ctx.fill()
    const eyelets = [66.6, 63.9, 61.4].map((y) => {
      const half = 1.9 * ((y - bottom) / (top - bottom)) + 1.2
      return [y, half] as const
    })
    ctx.strokeStyle = '#7C8AA3'
    ctx.lineWidth = 0.42 * k
    ctx.lineCap = 'round'
    ctx.beginPath()
    eyelets.forEach(([y, half], i) => {
      const [l] = [p.P(-half, y)]
      const [r] = [p.P(half, y)]
      const next = eyelets[i + 1]
      if (i === 0) { ctx.moveTo(...l); ctx.lineTo(...r) }
      if (next) {
        const nl = p.P(-next[1], next[0]), nr = p.P(next[1], next[0])
        ctx.moveTo(...l); ctx.lineTo(...nr)
        ctx.moveTo(...r); ctx.lineTo(...nl)
      }
    })
    ctx.stroke()
    for (const [y, half] of eyelets) {
      for (const s of [-1, 1]) {
        const [cx, cy] = p.P(s * half, y)
        ctx.beginPath()
        ctx.arc(cx, cy, 0.5 * k, 0, Math.PI * 2)
        ctx.fillStyle = '#C9CFD9'
        ctx.fill()
        ctx.beginPath()
        ctx.arc(cx, cy, 0.22 * k, 0, Math.PI * 2)
        ctx.fillStyle = '#1F2633'
        ctx.fill()
      }
    }
  }
  finish(p, outline)
  ctx.restore()
}

// ── Splash ────────────────────────────────────────────────────────────

const SPLASH = { base: '#4AC1A1', dark: '#2C9A7E', deep: '#23836B', light: '#7DD8BF', white: '#F4F6F5' }

function blob(p: Painter, cx: number, cy: number, r: number, rand: () => number) {
  const { ctx, k } = p
  const n = 14
  const pts: Pt[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const rr = r * (0.55 + rand() * 0.7)
    pts.push([cx + Math.cos(a) * rr * k, cy + Math.sin(a) * rr * k * (0.7 + rand() * 0.5)])
  }
  ctx.beginPath()
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  ctx.moveTo(...mid(pts[n - 1], pts[0]))
  for (let i = 0; i < n; i++) ctx.quadraticCurveTo(pts[i][0], pts[i][1], ...mid(pts[i], pts[(i + 1) % n]))
  ctx.closePath()
  ctx.fill()
}

function splashPattern(p: Painter, seed: number) {
  const { ctx, w, h, k } = p
  const rand = rng(seed)
  // Macchie grandi scure, poi chiare, poi schizzi piccoli
  const layers: [string, number, number, number][] = [
    [SPLASH.dark, 26, 3.5, 9],
    [SPLASH.deep, 18, 1.8, 5],
    [SPLASH.light, 16, 2, 6],
  ]
  for (const [color, count, minR, maxR] of layers) {
    ctx.fillStyle = color
    for (let i = 0; i < count; i++) {
      ctx.globalAlpha = 0.45 + rand() * 0.45
      const x = rand() * w, y = rand() * h
      const r = minR + rand() * (maxR - minR)
      blob(p, x, y, r, rand)
      // satelliti attorno alla macchia
      for (let j = 0; j < 5; j++) {
        const a = rand() * Math.PI * 2, d = r * (1 + rand() * 1.2) * k
        blob(p, x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.12 + rand() * 0.22), rand)
      }
    }
  }
  ctx.fillStyle = SPLASH.deep
  for (let i = 0; i < 520; i++) {
    ctx.globalAlpha = 0.25 + rand() * 0.5
    ctx.beginPath()
    ctx.arc(rand() * w, rand() * h, (0.12 + rand() * 0.45) * k, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function paintSplash(canvas: HTMLCanvasElement, side: 'front' | 'back', logo: HTMLImageElement | null) {
  const p = painter(canvas)
  const { ctx, shape, w, h, k } = p
  const outline = side === 'front' ? shape.front : shape.back
  const trims = side === 'front' ? shape.trims.front : shape.trims.back
  ctx.clearRect(0, 0, w, h)
  ctx.save()
  poly(p, outline)
  ctx.clip()
  ctx.fillStyle = SPLASH.base
  ctx.fillRect(0, 0, w, h)
  splashPattern(p, side === 'front' ? 7 : 19)
  for (const cuff of trims.slice(1)) {
    ctx.fillStyle = SPLASH.white
    cuffBand(p, cuff[0], cuff[1], -2, 3.4)
    ctx.fillStyle = SPLASH.dark
    cuffBand(p, cuff[0], cuff[1], 3.4, 3.8)
  }
  strokeTrim(p, trims[0], SPLASH.white, 3.4)
  strokeTrim(p, trims[0], 'rgba(0,0,0,0.08)', 0.4)
  if (side === 'front' && logo?.naturalWidth) {
    // Logo sul petto, a sinistra nella vista frontale
    const lh = 8.5 * k
    const lw = lh * (logo.naturalWidth / logo.naturalHeight)
    const [cx, cy] = p.P(-15, 58)
    ctx.drawImage(logo, cx - lw / 2, cy - lh / 2, lw, lh)
  }
  finish(p, outline)
  ctx.restore()
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

export async function paintJersey(design: JerseyDesign): Promise<JerseyTextures> {
  const front = document.createElement('canvas')
  const back = document.createElement('canvas')
  if (design === 'lupo') {
    paintLupo(front, 'front')
    paintLupo(back, 'back')
  } else {
    const logo = await loadImage('/brand/logo.png')
    paintSplash(front, 'front', logo)
    paintSplash(back, 'back', null)
  }
  return { front, back }
}

/** Mappa normale della maglia tecnica (micro-fori a nido d'ape), da ripetere. */
export function fabricNormalMap(size = 64) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(size, size)
  const height = (x: number, y: number) => {
    const u = (x / size) * Math.PI * 2 * 4, v = (y / size) * Math.PI * 2 * 4
    return Math.sin(u) * Math.sin(v) + 0.5 * Math.sin(u + v)
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = height(x + 1, y) - height(x - 1, y)
      const dy = height(x, y + 1) - height(x, y - 1)
      const nx = -dx, ny = -dy, nz = 2.5
      const l = Math.hypot(nx, ny, nz)
      const i = (y * size + x) * 4
      img.data[i] = (nx / l * 0.5 + 0.5) * 255
      img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255
      img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}
