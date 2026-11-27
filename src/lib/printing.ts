// Aree di stampa del cliente: prezzo per tecnica e area, ingombro degli elementi ruotati,
// controllo dentro l'area massima della zona e sovrapposizioni, centratura e posizionamento
// automatico "accanto" / "sotto". Rispecchia le funzioni SQL (print_element_price,
// print_box, print_box_inside, print_boxes_overlap): al checkout decide il database.
//
// Coordinate in cm dal punto di riferimento del pezzo, x verso destra e y verso il basso.

import type { PlacedElement, PrintZone, TechniqueCode } from '@/types/config'
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

export type ElementIssue = 'no_zone' | 'outside' | 'overlap' | 'technique' | 'category' | 'too_many' | 'empty_text'

/** Problemi di un'area rispetto alla sua zona e alle altre aree della stessa zona. */
export function elementIssues(
  el: PlacedElement, all: PlacedElement[], zones: PrintZoneRow[], techniques: PrintTechnique[], allOverAllowed: boolean,
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
 * spazio libero dentro l'area massima; null se non c'è più posto.
 */
export function nextSlot(z: Box, existing: PlacedElement[], w: number, h: number, axis: 'x' | 'y'): { xCm: number; yCm: number } | null {
  const boxes = existing.map(elementBox)
  const free = (x: number, y: number) => {
    const b = { x1: x - w / 2, y1: y - h / 2, x2: x + w / 2, y2: y + h / 2 }
    return insideBox(b, z) && !boxes.some((o) => boxesOverlap(b, o))
  }
  if (!boxes.length) {
    const x = round1((z.x1 + z.x2) / 2), y = round1(z.y1 + h / 2)
    return free(x, y) ? { xCm: x, yCm: y } : null
  }
  const last = boxes[boxes.length - 1]
  // prima prova accanto/sotto l'ultima, poi scorre righe (o colonne) dell'area massima
  const first = axis === 'x'
    ? { xCm: round1(last.x2 + GAP + w / 2), yCm: round1((last.y1 + last.y2) / 2) }
    : { xCm: round1((last.x1 + last.x2) / 2), yCm: round1(last.y2 + GAP + h / 2) }
  if (free(first.xCm, first.yCm)) return first
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
