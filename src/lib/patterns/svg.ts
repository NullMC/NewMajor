// Importazione di cartamodelli SVG: ogni forma chiusa (path, polygon, rect, ellipse…) è un pezzo.
// Le curve e le trasformazioni sono risolte dal browser campionando le forme a ~0,5 mm.
// Unità: dalle dimensioni del file (width/height in mm, cm, in, pt, px) e dal viewBox;
// se il file non le indica, 1 unità SVG = l'unità scelta nell'importazione.

import { cleanOutline, guessKind, normalizeOrigin, polygonArea, simplify, type Vec } from './geometry'
import { UNIT_TO_MM, type ImportedPiece, type SourceUnit } from './dxf'

const UNIT_MM: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96 }

function lengthMm(attr: string | null): number | null {
  const m = attr?.trim().match(/^([\d.]+)\s*(mm|cm|in|pt|pc|px)$/i)
  return m ? parseFloat(m[1]) * UNIT_MM[m[2].toLowerCase()] : null
}

export function parseSvg(text: string, unit: SourceUnit): { pieces: ImportedPiece[]; warnings: string[] } {
  const warnings: string[] = []
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const src = doc.documentElement
  if (src.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('File SVG non leggibile.')

  // millimetri per unità utente
  const vb = src.getAttribute('viewBox')?.split(/[\s,]+/).map(Number)
  const wMm = lengthMm(src.getAttribute('width'))
  let mmPerUnit = UNIT_TO_MM[unit]
  if (wMm && vb && vb.length === 4 && vb[2] > 0) mmPerUnit = wMm / vb[2]
  else if (wMm && !vb) mmPerUnit = wMm / parseFloat(src.getAttribute('width')!)
  else warnings.push('Il file SVG non indica le dimensioni fisiche: è stata usata l’unità selezionata. Controlla le misure dei pezzi.')

  // le forme vanno nel DOM per poterle campionare con le loro trasformazioni
  const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  host.setAttribute('style', 'position:absolute;left:-99999px;top:0;width:10px;height:10px;overflow:hidden')
  host.innerHTML = src.innerHTML
  if (vb) host.setAttribute('viewBox', vb.join(' '))
  document.body.appendChild(host)
  const pieces: ImportedPiece[] = []
  try {
    const rootCtm = host.getCTM()?.inverse() ?? null
    const shapes = Array.from(host.querySelectorAll<SVGGeometryElement>('path, polygon, rect, ellipse, circle, polyline'))
    shapes.forEach((el, i) => {
      if (el.closest('defs, clipPath, mask, symbol')) return
      const len = el.getTotalLength()
      if (!(len > 0)) return
      const ctm = el.getCTM()
      const m = rootCtm && ctm ? rootCtm.multiply(ctm) : ctm
      const step = Math.max(len / 6000, 0.5 / mmPerUnit)
      const raw: Vec[] = []
      for (let s = 0; s <= len; s += step) {
        const p = el.getPointAtLength(s)
        const q = m ? p.matrixTransform(m) : p
        raw.push([q.x * mmPerUnit, -q.y * mmPerUnit]) // y verso l'alto
      }
      const first = raw[0], last = raw[raw.length - 1]
      const closed = el.tagName !== 'polyline' || Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.5
      if (!closed) return
      const outline = cleanOutline(simplify(raw, 0.1))
      if (outline.length < 3) return
      const label = el.getAttribute('inkscape:label') || el.querySelector('title')?.textContent || el.id || el.parentElement?.id || `Pezzo ${i + 1}`
      const name = label.trim().slice(0, 120)
      pieces.push({ name, size: null, quantity: 1, kind: guessKind(name), outline: normalizeOrigin(outline), grainAngle: 0 })
    })
  } finally {
    host.remove()
  }
  // scarta forme minuscole (tacche, fori, testi convertiti) rispetto al pezzo più grande
  const maxArea = Math.max(0, ...pieces.map((p) => polygonArea(p.outline)))
  const kept = pieces.filter((p) => polygonArea(p.outline) > maxArea * 0.02)
  if (kept.length < pieces.length) warnings.push(`${pieces.length - kept.length} forme molto piccole (tacche, fori, testi) sono state ignorate.`)
  if (!kept.length) warnings.push('Nessuna forma chiusa trovata nel file SVG.')
  return { pieces: kept, warnings }
}
