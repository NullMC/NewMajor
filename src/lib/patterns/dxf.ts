// Importazione di cartamodelli DXF (AAMA / ASTM, esportati da Gerber, Lectra, CLO, Optitex…).
//
// Convenzione AAMA: ogni pezzo è un BLOCK; lo strato "1" contiene la linea di taglio, lo
// strato "7" il drittofilo; i testi del blocco riportano "Piece Name:", "Size:", "Quantity:".
// Se il file non usa i blocchi (es. DXF da Illustrator), ogni polilinea chiusa diventa un pezzo.
// Le tabelle di sviluppo taglie (grade rules) non sono interpretate: si importa un file per
// taglia, oppure un file con una forma per ogni taglia (testo "Size:" nel blocco).

import DxfParser from 'dxf-parser'
import type { IEntity } from 'dxf-parser'
import { bulgeArc, cleanOutline, guessKind, normalizeOrigin, round, type PieceKind, type Vec } from './geometry'

export type SourceUnit = 'mm' | 'cm' | 'in'
export const UNIT_TO_MM: Record<SourceUnit, number> = { mm: 1, cm: 10, in: 25.4 }

export interface ImportedPiece {
  name: string
  size: string | null
  quantity: number
  kind: PieceKind
  /** Contorno di taglio in mm, origine in basso a sinistra, verso antiorario. */
  outline: Vec[]
  /** Angolo del drittofilo rispetto alla verticale, in gradi (se presente nel file). */
  grainAngle: number
}

export interface DxfImport {
  pieces: ImportedPiece[]
  /** Unità suggerita dall'intestazione del file ($INSUNITS), se presente. */
  detectedUnit: SourceUnit | null
  warnings: string[]
}

type AnyEntity = IEntity & {
  vertices?: { x: number; y: number; bulge?: number }[]
  shape?: boolean
  text?: string
  name?: string
  position?: { x: number; y: number }
  startPoint?: { x: number; y: number }
}

const INSUNITS: Record<number, SourceUnit> = { 1: 'in', 4: 'mm', 5: 'cm' }
const CUT_LAYERS = new Set(['1', 'CUT', 'CUTLINE', 'TAGLIO'])
const GRAIN_LAYERS = new Set(['7', 'GRAIN', 'DRITTOFILO'])

/** Punti di una polilinea (con archi), eventualmente chiusa. */
function polyPoints(e: AnyEntity): { pts: Vec[]; closed: boolean } {
  const v = e.vertices ?? []
  const pts: Vec[] = []
  for (let i = 0; i < v.length; i++) {
    const a: Vec = [v[i].x, v[i].y]
    if (i === 0) pts.push(a)
    const next = v[i + 1] ?? (e.shape ? v[0] : null)
    if (!next) break
    const arc = bulgeArc(a, [next.x, next.y], v[i].bulge ?? 0)
    pts.push(...arc)
  }
  const first = pts[0], last = pts[pts.length - 1]
  const closed = !!e.shape || (pts.length > 2 && Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-6)
  return { pts, closed }
}

/** Unisce segmenti aperti (LINE o polilinee) che si toccano agli estremi in contorni chiusi. */
function chainSegments(segs: Vec[][], tol: number): Vec[][] {
  const left = segs.map((s) => [...s])
  const loops: Vec[][] = []
  const near = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol
  while (left.length) {
    let chain = left.shift()!
    let grew = true
    while (grew) {
      grew = false
      for (let i = 0; i < left.length; i++) {
        const s = left[i]
        const end = chain[chain.length - 1]
        if (near(end, s[0])) chain = [...chain, ...s.slice(1)]
        else if (near(end, s[s.length - 1])) chain = [...chain, ...[...s].reverse().slice(1)]
        else continue
        left.splice(i, 1)
        grew = true
        break
      }
    }
    if (chain.length > 3 && near(chain[0], chain[chain.length - 1])) loops.push(chain)
  }
  return loops
}

function readTexts(entities: AnyEntity[]) {
  const info: { name?: string; size?: string; quantity?: number } = {}
  for (const e of entities) {
    if (e.type !== 'TEXT' && e.type !== 'MTEXT') continue
    const t = String(e.text ?? '').replace(/\\P/g, '\n')
    for (const line of t.split(/\n/)) {
      const m = line.match(/^\s*(piece\s*name|name|nome(?:\s*pezzo)?|size|taglia|quantity|qty|quantit[aà])\s*:\s*(.+)$/i)
      if (!m) continue
      const key = m[1].toLowerCase(), val = m[2].trim()
      if (/size|taglia/.test(key)) info.size = val.slice(0, 20)
      else if (/qu|qty/.test(key)) info.quantity = Math.max(1, Math.min(20, parseInt(val, 10) || 1))
      else info.name = val.slice(0, 120)
    }
  }
  return info
}

function grainAngle(entities: AnyEntity[]): number {
  for (const e of entities) {
    if (!GRAIN_LAYERS.has(String(e.layer).toUpperCase()) || !e.vertices || e.vertices.length < 2) continue
    const [a, b] = e.vertices
    const deg = (Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI // 0 = verticale
    return round(((deg + 90) % 180) - 90, 2)
  }
  return 0
}

/** Contorni di taglio di un gruppo di entità: prima lo strato di taglio, altrimenti tutte le forme chiuse. */
function outlinesOf(entities: AnyEntity[]): Vec[][] {
  const pick = (onlyCut: boolean) => {
    const closed: Vec[][] = []
    const open: Vec[][] = []
    for (const e of entities) {
      if (onlyCut && !CUT_LAYERS.has(String(e.layer).toUpperCase())) continue
      if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
        const { pts, closed: c } = polyPoints(e)
        if (pts.length >= 2) (c ? closed : open).push(pts)
      } else if (e.type === 'LINE' && e.vertices?.length === 2) {
        open.push(e.vertices.map((v) => [v.x, v.y] as Vec))
      }
    }
    return [...closed, ...chainSegments(open, 0.05)]
  }
  const cut = pick(true)
  return cut.length ? cut : pick(false)
}

export function parseDxf(text: string, unit: SourceUnit | null = null): DxfImport {
  const dxf = new DxfParser().parseSync(text)
  if (!dxf) throw new Error('File DXF non leggibile.')
  const warnings: string[] = []
  const headerUnit = typeof dxf.header?.$INSUNITS === 'number' ? INSUNITS[dxf.header.$INSUNITS as number] ?? null : null
  const k = UNIT_TO_MM[unit ?? headerUnit ?? 'mm']
  const pieces: ImportedPiece[] = []

  const add = (raw: Vec[], meta: { name?: string; size?: string; quantity?: number }, grain: number, fallbackName: string) => {
    const outline = cleanOutline(raw.map(([x, y]) => [x * k, y * k] as Vec))
    if (outline.length < 3) return
    const name = meta.name || fallbackName
    pieces.push({ name, size: meta.size ?? null, quantity: meta.quantity ?? 1, kind: guessKind(name), outline: normalizeOrigin(outline), grainAngle: grain })
  }

  // Pezzi come blocchi (AAMA): si usano i blocchi richiamati nel disegno, o tutti se non ci sono INSERT
  const entities = (dxf.entities ?? []) as AnyEntity[]
  const inserted = new Set(entities.filter((e) => e.type === 'INSERT').map((e) => String(e.name)))
  const blocks = Object.values(dxf.blocks ?? {}).filter((b) => !b.name.startsWith('*') && (!inserted.size || inserted.has(b.name)))
  for (const b of blocks) {
    const ents = (b.entities ?? []) as AnyEntity[]
    const loops = outlinesOf(ents)
    if (!loops.length) continue
    // il contorno di taglio è il più grande del blocco; gli altri (cuciture, fori) si ignorano
    const main = loops.reduce((a, c) => (Math.abs(area(c)) > Math.abs(area(a)) ? c : a))
    add(main, readTexts(ents), grainAngle(ents), b.name)
  }

  // DXF senza blocchi: ogni forma chiusa è un pezzo
  if (!pieces.length) {
    const loops = outlinesOf(entities)
    loops.forEach((l, i) => add(l, {}, 0, `Pezzo ${i + 1}`))
    if (loops.length) warnings.push('Il file non contiene blocchi AAMA: ogni forma chiusa è stata importata come pezzo. Controlla nomi e tipi.')
  }

  if (!pieces.length) warnings.push('Nessun contorno chiuso trovato. Verifica che la linea di taglio sia sullo strato 1 o che le forme siano chiuse.')
  if (!unit && !headerUnit) warnings.push('Unità di misura non indicata nel file: è stata usata quella selezionata (mm). Controlla le dimensioni dei pezzi.')
  return { pieces, detectedUnit: headerUnit, warnings }
}

function area(pts: Vec[]) {
  let a = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1])
  return a / 2
}
