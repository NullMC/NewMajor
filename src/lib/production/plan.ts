// Piano di produzione di una riga d'ordine: l'elenco dei pezzi da stampare (per ogni capo del
// roster, nella sua taglia) con colore, grafiche, nomi e numeri già posizionati in millimetri
// sul pezzo. Funzioni pure: il disegno del PDF è in ./pdf.ts.
//
// Regole di posizionamento:
// - loghi e sponsor liberi: centro in cm dal riferimento del pezzo, uguale su ogni taglia;
// - aree dell'admin (nomi, numeri, loghi in area): la posizione è ricavata una volta sul pezzo
//   della taglia di riferimento (dalla stessa corrispondenza sagoma ↔ pezzo dell'anteprima) e poi
//   applicata in cm su ogni taglia; la dimensione è quella di stampa indicata nell'area;
// - grafiche all-over (area dell'admin o grafica del cliente su tutto il capo, con sostituzioni
//   per pezzo): coprono l'intero pezzo (abbondanza compresa).

import type { AssetRef, Configuration, PlacedElement, PrintZone, TextStyle } from '@/types/config'
import type { CustomizationArea, ModelShape, ProductDetail } from '@/types/db'
import { anchorOf, elementCenterMm, elementHeightCm } from '@/lib/patterns/placement'
import { bounds, cleanOutline, type PieceKind, type Vec } from '@/lib/patterns/geometry'
import { silhouetteFrame } from '@/features/configurator/garment/elements'
import { offsetOutline } from './offset'

export interface ProductionPiece {
  kitItemId: string | null
  size: string
  piece: PieceKind
  name: string
  quantity: number
  outline: Vec[]
  anchor: { x?: number; y?: number }
  mirror: boolean
  grain_angle: number
}

export interface Placement {
  kind: 'image' | 'text'
  asset?: AssetRef
  text?: string
  textKind?: 'text' | 'number'
  /** Centro in mm nelle coordinate del pezzo (y verso l'alto). */
  center: Vec
  /** Riquadro di stampa in mm (l'immagine vi è contenuta mantenendo le proporzioni). */
  w: number
  h: number
  /** Rotazione oraria in gradi. */
  rotation: number
  label: string
}

export interface PieceJob {
  id: string
  kitItemId: string | null
  componentLabel: string
  size: string
  piece: PieceKind
  pieceName: string
  copy: number
  copies: number
  mirrored: boolean
  playerName: string | null
  playerNumber: string | null
  rosterIndex: number
  cut: Vec[]
  bleed: Vec[]
  fill: string
  allOver: AssetRef | null
  placements: Placement[]
}

export interface PlanInput {
  product: ProductDetail
  config: Configuration
  pieces: ProductionPiece[]
  /** Taglia di riferimento per componente (null = capo principale). */
  referenceSize: Record<string, string | null>
  baseColor: string
  secondaryColor: string | null
  textStyle: TextStyle
  bleedMm: number
}

export interface PlanResult { jobs: PieceJob[]; warnings: string[] }

const keyOf = (k: string | null) => k ?? 'main'

/** Area dell'admin convertita in cm dal riferimento, sul pezzo della taglia di riferimento. */
export function areaToCm(area: CustomizationArea, shape: ModelShape, refPiece: Pick<ProductionPiece, 'outline' | 'anchor'>) {
  const { k, neck, bounds: b } = silhouetteFrame(shape, area.side, refPiece)
  if (!k) return null
  const W = b.maxX - b.minX, H = b.maxY - b.minY
  const cx = b.minX + ((Number(area.x) + Number(area.width) / 2) / 100) * W
  const cy = b.maxY - ((Number(area.y) + Number(area.height) / 2) / 100) * H
  return { xCm: cx / k / 10, yCm: (neck - cy) / k / 10 }
}

export function buildPlan(input: PlanInput): PlanResult {
  const { product, config, pieces, bleedMm } = input
  const warnings: string[] = []
  const jobs: PieceJob[] = []
  const isKit = product.product_type === 'kit' && product.kit_items.length > 0
  const components = isKit
    ? product.kit_items.map((k) => ({ id: k.id as string | null, label: k.label, shape: (k.model_shape ?? product.model_shape) as ModelShape }))
    : [{ id: null as string | null, label: product.name, shape: product.model_shape as ModelShape }]
  const firstKit = product.kit_items[0]?.id ?? null
  const roster = config.roster?.length ? config.roster : [{ id: 'single', quantity: 1 }]

  for (const comp of components) {
    const compPieces = pieces.filter((p) => (p.kitItemId ?? null) === comp.id)
    if (!compPieces.length) { warnings.push(`${comp.label}: nessun cartamodello caricato.`); continue }
    const refSize = input.referenceSize[keyOf(comp.id)] ?? compPieces[0].size
    const refOf = (kind: PieceKind) => compPieces.find((p) => p.size === refSize && p.piece === kind) ?? null
    const areas = product.customization_areas.filter((a) => a.is_active && (!isKit || (a.kit_item_id ?? firstKit) === comp.id))
    const elements = (config.elements ?? []).filter((e) => (e.kitItemId ?? null) === comp.id)
    const allOverCfg = (config.allOver ?? []).find((x) => (x.kitItemId ?? null) === comp.id) ?? null

    // posizione delle aree in cm, calcolata una volta sulla taglia di riferimento
    const areaCm = new Map<string, { xCm: number; yCm: number }>()
    for (const a of areas) {
      if (a.area_type === 'all_over') continue
      const ref = refOf(a.side)
      const cm = ref ? areaToCm(a, comp.shape, ref) : null
      if (cm) areaCm.set(a.id, cm)
      else if (config.areas[a.id]?.enabled) warnings.push(`${comp.label}: manca il pezzo ${a.side === 'front' ? 'davanti' : 'dietro'} della taglia di riferimento per l’area “${a.name}”.`)
    }

    roster.forEach((row, ri) => {
      const size = (isKit ? (row as { sizes?: Record<string, string> }).sizes?.[comp.id!] : (row as { size?: string }).size) || refSize
      const sizePieces = compPieces.filter((p) => p.size === size)
      if (!sizePieces.length) { warnings.push(`${comp.label}: nessun pezzo per la taglia ${size} (riga ${ri + 1}).`); return }
      const qty = Math.max(1, Number(row.quantity) || 1)
      const name = (row as { name?: string }).name?.trim() || null
      const number = (row as { number?: string }).number?.trim() || null

      for (const p of sizePieces) {
        const copies = p.quantity * qty
        const cut = p.outline
        const bleed = offsetOutline(cut, bleedMm)
        const placements: Placement[] = []
        let allOver: AssetRef | null = null

        if (p.piece === 'front' || p.piece === 'back') {
          for (const a of areas.filter((x) => x.side === p.piece)) {
            const ac = config.areas[a.id]
            if (!ac?.enabled) continue
            if (a.area_type === 'all_over') { if (ac.asset) allOver = ac.asset; continue }
            const cm = areaCm.get(a.id)
            if (!cm) continue
            const [cx, cy] = elementCenterMm(cm, p)
            const box = { center: [cx, cy] as Vec, w: Number(a.print_width_cm) * 10, h: Number(a.print_height_cm) * 10, rotation: 0, label: a.name }
            if (a.area_type === 'text') {
              const t = (name || ac.text || '').toUpperCase()
              if (t) placements.push({ ...box, kind: 'text', text: t, textKind: 'text' })
            } else if (a.area_type === 'number') {
              if (number) placements.push({ ...box, kind: 'text', text: number, textKind: 'number' })
            } else if (ac.asset) {
              const s = Math.max(0.05, Math.min(1, ac.scale ?? 1))
              placements.push({ ...box, w: box.w * s, h: box.h * s, kind: 'image', asset: ac.asset })
            }
          }
        }
        for (const e of elements.filter((x) => x.zone === p.piece)) placements.push(elementPlacement(e, p))
        // grafica all-over del cliente: sostituzione del pezzo, altrimenti la grafica del capo
        // (collo e polsini restano nel colore dei profili)
        if (allOverCfg && p.piece !== 'collar' && p.piece !== 'cuff') {
          allOver = allOverCfg.overrides?.[p.piece as PrintZone] ?? allOverCfg.asset
        }

        const fill = p.piece === 'collar' || p.piece === 'cuff' ? input.secondaryColor || input.baseColor : input.baseColor
        for (let c = 0; c < copies; c++) {
          // coppie specchiate (es. fianchi): si specchiano contorno e posizioni, non le grafiche
          const mirrored = p.mirror && c % 2 === 1
          const axis = (() => { const b = bounds(cut); return b.minX + b.maxX })()
          const mx = (pts: Vec[]) => cleanOutline(pts.map(([x, y]) => [axis - x, y] as Vec))
          jobs.push({
            id: `${keyOf(comp.id)}-${ri}-${p.size}-${p.piece}-${p.name}-${c}`,
            kitItemId: comp.id, componentLabel: comp.label, size: p.size, piece: p.piece, pieceName: p.name,
            copy: c + 1, copies, mirrored,
            playerName: name, playerNumber: number, rosterIndex: ri,
            cut: mirrored ? mx(cut) : cut,
            bleed: mirrored ? mx(bleed) : bleed,
            fill, allOver,
            placements: mirrored ? placements.map((pl) => ({ ...pl, center: [axis - pl.center[0], pl.center[1]] as Vec, rotation: -pl.rotation })) : placements,
          })
        }
      }
    })
  }
  return { jobs, warnings }
}

function elementPlacement(e: PlacedElement, p: ProductionPiece): Placement {
  return {
    kind: 'image', asset: e.asset, center: elementCenterMm(e, p),
    w: e.widthCm * 10, h: elementHeightCm(e) * 10, rotation: e.rotation || 0,
    label: e.kind === 'logo' ? 'Logo' : 'Sponsor',
  }
}

/** Riquadro (mm) del contorno con abbondanza, per la disposizione. */
export function jobBounds(job: PieceJob) {
  return bounds(job.bleed)
}

export { anchorOf }
