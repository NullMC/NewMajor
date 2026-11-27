// Aree di stampa del cliente: prezzo per tecnica e area, ingombro degli elementi ruotati,
// controllo dentro l'area massima della zona e sovrapposizioni, centratura e posizionamento
// automatico "accanto" / "sotto". Rispecchia le funzioni SQL (print_element_price,
// print_box, print_box_inside, print_boxes_overlap): al checkout decide il database.
//
// Coordinate in cm dal punto di riferimento del pezzo, x verso destra e y verso il basso.

import type { PlacedElement, PrintZone, TechniqueCode, ZoneLayout } from '@/types/config'
import type { PrintTechnique, PrintZoneRow } from '@/types/db'

const TOL = 0.05
const GAP = 0.5 // distanza tra aree affiancate (cm)

export const TECHNIQUE_LABEL: Record<TechniqueCode, string> = {
  screen: 'Serigrafia',
  dtf: 'Stampa DTF',
  embroidery: 'Ricamo',
  sublimation: 'Sublimazione',
}

export interface Box { x1: number; y1: number; x2: number; y2: number }

const round2 = (n: number) => Math.round(n * 100) / 100
const round1 = (n: number) => Math.round(n * 10) / 10

/** Altezza dell'elemento in cm: quella indicata, altrimenti dalle proporzioni della grafica. */
export function heightOf(el: Pick<PlacedElement, 'widthCm' | 'heightCm' | 'asset'>): number {
  if (el.heightCm && el.heightCm > 0) return el.heightCm
  const a = el.asset
  return a && a.width > 0 && a.height > 0 ? (el.widthCm * a.height) / a.width : el.widthCm
}

/** Rettangolo dell'area massima della zona. */
export function zoneBox(z: Pick<PrintZoneRow, 'x_cm' | 'y_cm' | 'width_cm' | 'height_cm'>): Box {
  const x = Number(z.x_cm), y = Number(z.y_cm)
  return { x1: x, y1: y, x2: x + Number(z.width_cm), y2: y + Number(z.height_cm) }
}

/** Ingombro (allineato agli assi) dell'elemento ruotato. */
export function elementBox(el: Pick<PlacedElement, 'xCm' | 'yCm' | 'widthCm' | 'heightCm' | 'asset' | 'rotation'>): Box {
  const w = el.widthCm, h = heightOf(el)
  const a = ((el.rotation || 0) * Math.PI) / 180
  const hx = (w * Math.abs(Math.cos(a)) + h * Math.abs(Math.sin(a))) / 2
  const hy = (w * Math.abs(Math.sin(a)) + h * Math.abs(Math.cos(a))) / 2
  return { x1: el.xCm - hx, y1: el.yCm - hy, x2: el.xCm + hx, y2: el.yCm + hy }
}

export const insideBox = (b: Box, z: Box) => b.x1 >= z.x1 - TOL && b.y1 >= z.y1 - TOL && b.x2 <= z.x2 + TOL && b.y2 <= z.y2 + TOL
export const boxesOverlap = (a: Box, b: Box) => a.x1 < b.x2 - TOL && b.x1 < a.x2 - TOL && a.y1 < b.y2 - TOL && b.y1 < a.y2 - TOL

/** Zona di stampa per zona e componente (null se il prodotto non la prevede). */
export function findZone(zones: PrintZoneRow[], zone: PrintZone, kitItemId: string | null | undefined): PrintZoneRow | null {
  return zones.find((z) => z.zone === zone && (z.kit_item_id ?? null) === (kitItemId ?? null)) ?? null
}

/** Prezzo di un'area: minimo + (area / area massima della zona) × (massimo − minimo). */
export function elementPrice(el: Pick<PlacedElement, 'widthCm' | 'heightCm' | 'asset'>, zone: Pick<PrintZoneRow, 'width_cm' | 'height_cm'>, t: Pick<PrintTechnique, 'min_price' | 'max_price'>): number {
  const area = el.widthCm * heightOf(el)
  const max = Number(zone.width_cm) * Number(zone.height_cm)
  const k = max > 0 ? Math.min(1, Math.max(0, area / max)) : 0
  return round2(Number(t.min_price) + k * (Number(t.max_price) - Number(t.min_price)))
}

export type ElementIssue = 'no_zone' | 'outside' | 'overlap' | 'overlap_fixed' | 'technique' | 'category' | 'too_many' | 'empty_text'

/**
 * Problemi di un'area rispetto alla sua zona, alle altre aree della stessa zona e alle aree fisse
 * dell'admin in uso sullo stesso lato (`blocked`, in cm come le aree).
 */
export function elementIssues(
  el: PlacedElement, all: PlacedElement[], zones: PrintZoneRow[], techniques: PrintTechnique[], allOverAllowed: boolean, blocked: Box[] = [],
): ElementIssue[] {
  if (!el.technique) return []
  const out: ElementIssue[] = []
  const z = findZone(zones, el.zone, el.kitItemId)
  if (!z) return ['no_zone']
  const t = techniques.find((x) => x.code === el.technique)
  if (!t || !t.is_active || !z.techniques.includes(el.technique) || (t.all_over_only && !allOverAllowed)) out.push('technique')
  if ((el.kind === 'text' && !z.allow_text) || (el.kind !== 'text' && !z.allow_graphic)) out.push('category')
  if (el.kind === 'text' && !el.text?.trim()) out.push('empty_text')
  const box = elementBox(el)
  if (!insideBox(box, zoneBox(z))) out.push('outside')
  const same = all.filter((o) => o.technique && o.zone === el.zone && (o.kitItemId ?? null) === (el.kitItemId ?? null))
  if (same.some((o) => o.id !== el.id && boxesOverlap(box, elementBox(o)))) out.push('overlap')
  if (blocked.some((b) => boxesOverlap(box, b))) out.push('overlap_fixed')
  if (same.length > z.max_items) out.push('too_many')
  return out
}

/** Riduce le misure per stare nell'area massima (mantenendo le proporzioni). */
export function fitSize(w: number, h: number, z: Box): { w: number; h: number } {
  const k = Math.min(1, (z.x2 - z.x1) / w, (z.y2 - z.y1) / h)
  return { w: round1(w * k), h: round1(h * k) }
}

/** Centra l'elemento nell'area massima lungo l'asse indicato. */
export function centerIn(z: Box, axis: 'x' | 'y'): Pick<PlacedElement, 'xCm'> | Pick<PlacedElement, 'yCm'> {
  return axis === 'x' ? { xCm: round1((z.x1 + z.x2) / 2) } : { yCm: round1((z.y1 + z.y2) / 2) }
}

/**
 * Posizione per una nuova area di w × h cm: accanto (asse orizzontale) o sotto (asse verticale)
 * all'ultima area della zona, oppure in alto a sinistra se la zona è vuota. Cerca il primo
 * spazio libero dentro l'area massima, evitando le aree fisse (`blocked`); null se non c'è più posto.
 */
export function nextSlot(z: Box, existing: PlacedElement[], w: number, h: number, axis: 'x' | 'y', blocked: Box[] = []): { xCm: number; yCm: number } | null {
  const boxes = existing.map(elementBox)
  const free = (x: number, y: number) => {
    const b = { x1: x - w / 2, y1: y - h / 2, x2: x + w / 2, y2: y + h / 2 }
    return insideBox(b, z) && !boxes.some((o) => boxesOverlap(b, o)) && !blocked.some((o) => boxesOverlap(b, o))
  }
  const last = boxes[boxes.length - 1]
  if (!last) {
    const x = round1((z.x1 + z.x2) / 2), y = round1(z.y1 + h / 2)
    if (free(x, y)) return { xCm: x, yCm: y }
  }
  // prima prova accanto/sotto l'ultima, poi scorre righe (o colonne) dell'area massima
  const first = !last ? null : axis === 'x'
    ? { xCm: round1(last.x2 + GAP + w / 2), yCm: round1((last.y1 + last.y2) / 2) }
    : { xCm: round1((last.x1 + last.x2) / 2), yCm: round1(last.y2 + GAP + h / 2) }
  if (first && free(first.xCm, first.yCm)) return first
  const step = 0.5
  if (axis === 'x') {
    for (let y = z.y1 + h / 2; y <= z.y2 - h / 2 + TOL; y += step) {
      for (let x = z.x1 + w / 2; x <= z.x2 - w / 2 + TOL; x += step) if (free(x, y)) return { xCm: round1(x), yCm: round1(y) }
    }
  } else {
    for (let x = z.x1 + w / 2; x <= z.x2 - w / 2 + TOL; x += step) {
      for (let y = z.y1 + h / 2; y <= z.y2 - h / 2 + TOL; y += step) if (free(x, y)) return { xCm: round1(x), yCm: round1(y) }
    }
  }
  return null
}

/** Etichetta di un'area per riepiloghi e messaggi. */
export function elementLabel(el: Pick<PlacedElement, 'kind' | 'text'>, index: number): string {
  if (el.kind === 'text') return `Testo ${index + 1}${el.text ? ` “${el.text}”` : ''}`
  if (el.kind === 'sponsor') return `Sponsor ${index + 1}`
  if (el.kind === 'logo') return `Logo ${index + 1}`
  return `Grafica ${index + 1}`
}

/**
 * Spazio utilizzabile della zona: la fascia verticale più alta libera dalle aree fisse in uso
 * (nome, numero, loghi dell'admin). Senza aree fisse è l'intera area massima.
 */
export function usableBox(z: Box, blocked: Box[]): Box {
  const cuts = blocked.filter((b) => boxesOverlap(b, z)).map((b) => [Math.max(z.y1, b.y1), Math.min(z.y2, b.y2)] as const).sort((a, b) => a[0] - b[0])
  if (!cuts.length) return z
  let best: [number, number] = [z.y1, z.y1], y = z.y1
  for (const [a, b] of cuts) {
    if (a - y > best[1] - best[0]) best = [y, a]
    y = Math.max(y, b)
  }
  if (z.y2 - y > best[1] - best[0]) best = [y, z.y2]
  // piccolo margine dalle aree fisse
  const top = best[0] > z.y1 ? best[0] + GAP : best[0], bottom = best[1] < z.y2 ? best[1] - GAP : best[1]
  return { x1: z.x1, x2: z.x2, y1: round1(top), y2: round1(Math.max(top, bottom)) }
}

/**
 * Divide lo spazio in parti uguali tra le aree (nell'ordine dato): affiancate, una sotto l'altra o
 * a griglia. Ogni area occupa la sua parte mantenendo le proporzioni della grafica (o del testo),
 * centrata; la rotazione torna a 0. Restituisce le nuove misure per id.
 */
export function distribute(z: Box, els: PlacedElement[], layout: Exclude<ZoneLayout, 'free'>, gap = 1): Map<string, Pick<PlacedElement, 'xCm' | 'yCm' | 'widthCm' | 'heightCm' | 'rotation'>> {
  const out = new Map<string, Pick<PlacedElement, 'xCm' | 'yCm' | 'widthCm' | 'heightCm' | 'rotation'>>()
  const n = els.length
  if (!n) return out
  const cols = layout === 'columns' ? n : layout === 'rows' ? 1 : Math.ceil(Math.sqrt(n))
  const rows = Math.ceil(n / cols)
  const W = z.x2 - z.x1, H = z.y2 - z.y1
  const cw = (W - gap * (cols - 1)) / cols, ch = (H - gap * (rows - 1)) / rows
  const floor1 = (v: number) => Math.floor(v * 10) / 10
  els.forEach((el, i) => {
    const r = Math.floor(i / cols), c = i % cols
    // l'ultima riga incompleta della griglia viene centrata
    const inRow = r === rows - 1 ? n - r * cols : cols
    const offset = ((cols - inRow) * (cw + gap)) / 2
    const ratio = heightOf(el) / el.widthCm || 1
    const w = Math.max(0.5, floor1(Math.min(cw - 0.2, (ch - 0.2) / ratio)))
    const h = Math.max(0.5, floor1(w * ratio))
    out.set(el.id, {
      xCm: round1(z.x1 + offset + c * (cw + gap) + cw / 2),
      yCm: round1(z.y1 + r * (ch + gap) + ch / 2),
      widthCm: w, heightCm: h, rotation: 0,
    })
  })
  return out
}

/** Posizioni rapide sul davanti: lato cuore (sinistra di chi indossa), centro petto, lato opposto. */
export type QuickSpot = 'heart' | 'chest' | 'opposite'
export function quickSpot(z: Box, el: Pick<PlacedElement, 'widthCm' | 'heightCm' | 'asset'>, spot: QuickSpot): Pick<PlacedElement, 'xCm' | 'yCm' | 'rotation'> {
  const W = z.x2 - z.x1, H = z.y2 - z.y1, w = el.widthCm, h = heightOf(el)
  const cx = (z.x1 + z.x2) / 2
  // il lato cuore è a destra di chi guarda il capo
  const side = Math.min(W * 0.27, W / 2 - w / 2)
  const x = spot === 'heart' ? cx + side : spot === 'opposite' ? cx - side : cx
  const y = z.y1 + Math.max(h / 2 + 1, Math.min(H * 0.18, H - h / 2))
  return { xCm: round1(x), yCm: round1(Math.min(y, z.y2 - h / 2)), rotation: 0 }
}
