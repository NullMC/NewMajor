// Piano di produzione di una riga d'ordine. Funzioni pure: il disegno del PDF è in ./pdf.ts.
//
// Tre uscite:
// - jobs: i pezzi del cartamodello da stampare in sublimazione (per ogni capo del roster, nella
//   sua taglia) con fondo, grafica all-over o colore della sezione, fasce, nomi, numeri e le aree
//   in sublimazione già posizionate in millimetri sul pezzo;
// - transfers: le aree in DTF, da stampare a parte su film in scala 1:1 (una copia per capo);
// - specs: le schede di posizionamento di ogni zona (tutte le aree con tecnica, misure e
//   posizione in cm dal riferimento), per serigrafia, ricamo e applicazione dei transfer.
//
// Regole di posizionamento:
// - aree del cliente (grafiche e testi): centro in cm dal riferimento del pezzo, uguale su ogni
//   taglia; sulle gambe del pantaloncino il davanti si misura dal centro davanti in vita e il
//   dietro dal centro dietro, e l'area si disegna su entrambe le gambe ritagliata dal contorno
//   (così un'area a cavallo della cucitura centrale si ricompone una volta cucito il capo);
// - aree dell'admin (nomi, numeri, loghi in area): la posizione è ricavata una volta sul pezzo
//   della taglia di riferimento e poi applicata in cm su ogni taglia;
// - grafiche all-over: coprono l'intero pezzo; per sezione il cliente può scegliere un'altra
//   grafica o un colore pieno;
// - fasce: striscia sul fondo delle maniche (capi superiori) o delle gambe (pantaloni);
// - taglie senza dima: si usa la dima della taglia di riferimento, segnalandolo.

import type { AssetRef, BandConfig, Configuration, PlacedElement, PrintZone, SectionKey, TechniqueCode, TextStyle } from '@/types/config'
import type { CustomizationArea, ModelShape, PrintTechnique, PrintZoneRow, ProductDetail } from '@/types/db'
import { anchorOf, elementCenterMm, elementCornersMm, elementHeightCm, SECTION_LABEL } from '@/lib/patterns/placement'
import { bounds, cleanOutline, type PieceAnchor, type PieceKind, type Vec } from '@/lib/patterns/geometry'
import { elementPrice, findZone } from '@/lib/printing'
import { silhouetteFrame, virtualPiece } from '@/features/configurator/garment/elements'
import { offsetOutline } from './offset'

export interface ProductionPiece {
  kitItemId: string | null
  size: string
  piece: PieceKind
  name: string
  quantity: number
  outline: Vec[]
  anchor: PieceAnchor
  mirror: boolean
  grain_angle: number
}

export interface Placement {
  kind: 'image' | 'text'
  asset?: AssetRef
  text?: string
  textKind?: 'text' | 'number'
  /** Stile del testo delle aree del cliente (altrimenti quello di nomi e numeri). */
  textStyle?: TextStyle
  /** Centro in mm nelle coordinate del pezzo (y verso l'alto). */
  center: Vec
  /** Riquadro di stampa in mm (l'immagine vi è contenuta mantenendo le proporzioni). */
  w: number
  h: number
  /** Rotazione oraria in gradi. */
  rotation: number
  label: string
}

export interface BandFill { heightMm: number; color: string | null; asset: AssetRef | null }

export interface PieceJob {
  id: string
  kitItemId: string | null
  componentLabel: string
  size: string
  /** Taglia della dima usata (diversa da `size` se la taglia non ha pezzi propri). */
  patternSize: string
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
  band: BandFill | null
  placements: Placement[]
}

/** Transfer DTF: stampato su film in scala 1:1, non ruotato (la rotazione si applica in pressa). */
export interface TransferItem {
  id: string
  componentLabel: string
  zone: PrintZone
  label: string
  kind: 'image' | 'text'
  asset?: AssetRef
  text?: string
  textStyle?: TextStyle
  w: number
  h: number
  copies: number
}

export interface SpecItem {
  label: string
  technique: TechniqueCode | null
  kind: PlacedElement['kind']
  text?: string
  asset?: AssetRef
  widthCm: number
  heightCm: number
  xCm: number
  yCm: number
  rotation: number
  price: number | null
  /** Vertici del rettangolo ruotato, in mm nelle coordinate del pezzo di riferimento. */
  corners: Vec[]
}

/** Scheda di posizionamento di una zona di un componente. */
export interface SpecSheet {
  id: string
  componentLabel: string
  zone: PrintZone
  zoneLabel: string
  /** Pezzo del disegno: taglia di riferimento del cartamodello o sagoma indicativa. */
  pieceName: string
  size: string | null
  outline: Vec[]
  anchor: Vec
  virtual: boolean
  /** Capi da lavorare (somma delle quantità del roster). */
  garments: number
  items: SpecItem[]
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
  /** Tecniche con i prezzi, per il riepilogo (facoltative). */
  techniques?: PrintTechnique[]
  /** Anteprima del configuratore: tutte le aree sul pezzo, qualunque sia la tecnica. */
  preview?: boolean
}

export interface PlanResult { jobs: PieceJob[]; transfers: TransferItem[]; specs: SpecSheet[]; warnings: string[] }

const keyOf = (k: string | null) => k ?? 'main'
const isBottom = (s: ModelShape) => s === 'shorts' || s === 'track_pants'
const isLeg = (k: PieceKind) => k === 'leg_left' || k === 'leg_right'
const isSleeve = (k: PieceKind) => k === 'sleeve_left' || k === 'sleeve_right'
/** Le aree in sublimazione (e i loghi/sponsor senza tecnica) si stampano sul pezzo. */
export const printedOnPiece = (e: Pick<PlacedElement, 'technique'>) => !e.technique || e.technique === 'sublimation'

const elementTextStyle = (e: PlacedElement): TextStyle => ({ color: e.color || '#FFFFFF', outline: null, font: e.font ?? 'block' })
const KIND_LABEL: Record<PlacedElement['kind'], string> = { logo: 'Logo', sponsor: 'Sponsor', graphic: 'Grafica', text: 'Testo' }

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
  const transfers: TransferItem[] = []
  const specs: SpecSheet[] = []
  const isKit = product.product_type === 'kit' && product.kit_items.length > 0
  const components = isKit
    ? product.kit_items.map((k) => ({ id: k.id as string | null, label: k.label, shape: (k.model_shape ?? product.model_shape) as ModelShape, src: k as { band_enabled?: boolean; band_height_cm?: number } }))
    : [{ id: null as string | null, label: product.name, shape: product.model_shape as ModelShape, src: product as { band_enabled?: boolean; band_height_cm?: number } }]
  const firstKit = product.kit_items[0]?.id ?? null
  const roster = config.roster?.length ? config.roster : [{ id: 'single', quantity: 1 }]
  const zones: PrintZoneRow[] = product.print_zones ?? []

  for (const comp of components) {
    const compPieces = pieces.filter((p) => (p.kitItemId ?? null) === comp.id)
    const elements = (config.elements ?? []).filter((e) => (e.kitItemId ?? null) === comp.id)
    const garments = roster.reduce((s, r) => s + Math.max(1, Number(r.quantity) || 1), 0)
    const refSize = input.referenceSize[keyOf(comp.id)] ?? compPieces[0]?.size ?? null
    const refOf = (kind: PieceKind) => compPieces.find((p) => p.size === refSize && p.piece === kind) ?? null

    // schede di posizionamento e transfer DTF: non richiedono il cartamodello
    const kindIndex = new Map<string, number>()
    const zoneOrder: PrintZone[] = ['front', 'back', 'sleeve_left', 'sleeve_right']
    for (const zone of zoneOrder) {
      const zEls = elements.filter((e) => e.zone === zone)
      if (!zEls.length) continue
      const real = isBottom(comp.shape) ? null : refOf(zone)
      const piece = real ?? virtualPiece(comp.shape, zone, comp.id)
      const items: SpecItem[] = zEls.map((e) => {
        const n = (kindIndex.get(e.kind) ?? 0) + 1
        kindIndex.set(e.kind, n)
        const label = `${KIND_LABEL[e.kind]} ${n}${e.kind === 'text' && e.text ? ` “${e.text}”` : ''}`
        const z = findZone(zones, zone, comp.id)
        const t = input.techniques?.find((x) => x.code === e.technique)
        const heightCm = Math.round(elementHeightCm(e) * 10) / 10
        if (e.technique === 'dtf') {
          transfers.push({
            id: `${keyOf(comp.id)}-${e.id}`, componentLabel: comp.label, zone, label: `${label} · ${SECTION_LABEL[zone]}`,
            kind: e.kind === 'text' ? 'text' : 'image', asset: e.asset, text: e.text?.toUpperCase(), textStyle: e.kind === 'text' ? elementTextStyle(e) : undefined,
            w: e.widthCm * 10, h: heightCm * 10, copies: garments,
          })
        }
        return {
          label, technique: e.technique ?? null, kind: e.kind, text: e.text, asset: e.asset,
          widthCm: e.widthCm, heightCm, xCm: e.xCm, yCm: e.yCm, rotation: e.rotation || 0,
          price: z && t ? elementPrice(e, z, t) : null,
          corners: elementCornersMm(e, piece),
        }
      })
      specs.push({
        id: `${keyOf(comp.id)}-${zone}`, componentLabel: comp.label, zone, zoneLabel: SECTION_LABEL[zone],
        pieceName: piece.name, size: real ? real.size : null, outline: piece.outline, anchor: anchorOf(piece),
        virtual: !real, garments, items,
      })
    }

    if (!compPieces.length) {
      if (elements.some(printedOnPiece) || (config.allOver ?? []).some((x) => (x.kitItemId ?? null) === comp.id)) {
        warnings.push(`${comp.label}: nessun cartamodello caricato, i pezzi da sublimare non sono nel file.`)
      }
      continue
    }
    const areas = product.customization_areas.filter((a) => a.is_active && (!isKit || (a.kit_item_id ?? firstKit) === comp.id))
    const allOverCfg = (config.allOver ?? []).find((x) => (x.kitItemId ?? null) === comp.id) ?? null
    const bandCfg: BandConfig | null = comp.src.band_enabled ? (config.bands ?? []).find((b) => (b.kitItemId ?? null) === comp.id) ?? null : null
    const band: BandFill | null = bandCfg && (bandCfg.mode === 'color' ? bandCfg.color : bandCfg.asset)
      ? { heightMm: Number(comp.src.band_height_cm ?? 4) * 10, color: bandCfg.mode === 'color' ? bandCfg.color ?? null : null, asset: bandCfg.mode === 'graphic' ? bandCfg.asset ?? null : null }
      : null

    // posizione delle aree dell'admin in cm, calcolata una volta sulla taglia di riferimento
    const areaCm = new Map<string, { xCm: number; yCm: number }>()
    for (const a of areas) {
      if (a.area_type === 'all_over') continue
      const ref = refOf(a.side)
      const cm = ref ? areaToCm(a, comp.shape, ref) : null
      if (cm) areaCm.set(a.id, cm)
      else if (config.areas[a.id]?.enabled) warnings.push(`${comp.label}: manca il pezzo ${a.side === 'front' ? 'davanti' : 'dietro'} della taglia di riferimento per l’area “${a.name}”.`)
    }

    const fallbackWarned = new Set<string>()
    roster.forEach((row, ri) => {
      const size = (isKit ? (row as { sizes?: Record<string, string> }).sizes?.[comp.id!] : (row as { size?: string }).size) || refSize || compPieces[0].size
      let patternSize = size
      let sizePieces = compPieces.filter((p) => p.size === size)
      if (!sizePieces.length && refSize) {
        patternSize = refSize
        sizePieces = compPieces.filter((p) => p.size === refSize)
        if (!fallbackWarned.has(size)) {
          fallbackWarned.add(size)
          warnings.push(`${comp.label}: taglia ${size} senza dima, usata la dima ${refSize}.`)
        }
      }
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
        let fill = p.piece === 'collar' || p.piece === 'cuff' ? input.secondaryColor || input.baseColor : input.baseColor

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
        // aree del cliente stampate sul pezzo: sulle gambe sia il davanti sia il dietro
        const onPiece = elements.filter((e) => input.preview || printedOnPiece(e)).filter((e) => (isLeg(p.piece) ? e.zone === 'front' || e.zone === 'back' : e.zone === p.piece))
        for (const e of onPiece) placements.push(elementPlacement(e, p, isLeg(p.piece) ? (e.zone as 'front' | 'back') : 'front'))

        // grafica all-over del cliente: colore o grafica della sezione, altrimenti quella del capo
        // (collo e polsini restano nel colore dei profili)
        if (allOverCfg && p.piece !== 'collar' && p.piece !== 'cuff' && p.piece !== 'other') {
          const section = p.piece as SectionKey
          const color = allOverCfg.colors?.[section]
          if (color) { fill = color; allOver = null } else allOver = allOverCfg.overrides?.[section] ?? allOverCfg.asset ?? allOver
        }
        const pieceBand = band && (isBottom(comp.shape) ? isLeg(p.piece) : isSleeve(p.piece)) ? band : null

        for (let c = 0; c < copies; c++) {
          // coppie specchiate (es. fianchi): si specchiano contorno e posizioni, non le grafiche
          const mirrored = p.mirror && c % 2 === 1
          const axis = (() => { const b = bounds(cut); return b.minX + b.maxX })()
          const mx = (pts: Vec[]) => cleanOutline(pts.map(([x, y]) => [axis - x, y] as Vec))
          jobs.push({
            id: `${keyOf(comp.id)}-${ri}-${p.size}-${p.piece}-${p.name}-${c}`,
            kitItemId: comp.id, componentLabel: comp.label, size, patternSize, piece: p.piece, pieceName: p.name,
            copy: c + 1, copies, mirrored,
            playerName: name, playerNumber: number, rosterIndex: ri,
            cut: mirrored ? mx(cut) : cut,
            bleed: mirrored ? mx(bleed) : bleed,
            fill, allOver, band: pieceBand,
            placements: mirrored ? placements.map((pl) => ({ ...pl, center: [axis - pl.center[0], pl.center[1]] as Vec, rotation: -pl.rotation })) : placements,
          })
        }
      }
    })
  }
  return { jobs, transfers, specs, warnings }
}

function elementPlacement(e: PlacedElement, p: ProductionPiece, side: 'front' | 'back'): Placement {
  const base = { center: elementCenterMm(e, p, side), w: e.widthCm * 10, h: elementHeightCm(e) * 10, rotation: e.rotation || 0, label: KIND_LABEL[e.kind] }
  return e.kind === 'text'
    ? { ...base, kind: 'text', text: (e.text ?? '').toUpperCase(), textKind: 'text', textStyle: elementTextStyle(e) }
    : { ...base, kind: 'image', asset: e.asset }
}

/** Riquadro (mm) del contorno con abbondanza, per la disposizione. */
export function jobBounds(job: PieceJob) {
  return bounds(job.bleed)
}

export { anchorOf }
