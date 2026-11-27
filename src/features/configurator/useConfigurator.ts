import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AssetRef, AreaConfig, BandConfig, Configuration, PlacedElement, PrintZone, RosterEntry, SectionKey, TextStyle } from '@/types/config'
import { emptyConfiguration } from '@/types/config'
import type { CustomizationArea, CustomizationAsset, ModelShape, PrintTechnique, PrintZoneRow, ProductDetail, QualitySettings } from '@/types/db'
import { computePrice, configQuantity } from '@/lib/pricing'
import { evaluateQuality, effectiveDpi, readImageInfo, type QualityReport } from '@/lib/imageQuality'
import { uid } from '@/lib/slug'
import { PUBLIC_BUCKET } from '@/lib/storage'
import { centerIn, elementIssues, elementLabel, findZone, fitSize, heightOf, nextSlot, zoneBox, type Box, type ElementIssue } from '@/lib/printing'
import { assetDisplayUrl, storeGraphic } from '@/features/cart/assets'
import { canvasToBlob, drawPanel, ensureFonts, isDark, LIVE_PANEL_WIDTH, type PanelLayer } from './garment/panel'
import { areaBoxCm, drawSleeve, drawSleevePreview, silhouetteUnitsPerMm, sleeveInfo, toSilhouette, virtualPiece, withTextImages } from './garment/elements'
import { elementDpi, elementHeightCm, SECTION_LABEL, zonePiece, ZONE_LABEL, type ZonePiece } from '@/lib/patterns/placement'

const solidCache = new Map<string, HTMLCanvasElement>()
/** Immagine 1×1 di un colore pieno (colori per sezione, fasce colorate). */
export function solidImage(color: string): HTMLCanvasElement {
  let c = solidCache.get(color)
  if (!c) {
    c = document.createElement('canvas')
    c.width = c.height = 4
    const ctx = c.getContext('2d')
    if (ctx) { ctx.fillStyle = color; ctx.fillRect(0, 0, 4, 4) }
    solidCache.set(color, c)
  }
  return c
}

const ISSUE_TEXT: Record<ElementIssue, string> = {
  no_zone: 'la zona non prevede aree di stampa',
  outside: 'esce dall’area di stampa: spostala o riducila',
  overlap: 'si sovrappone a un’altra area',
  overlap_fixed: 'si sovrappone a un logo, sponsor, nome o numero già scelto: spostala',
  technique: 'tecnica non disponibile in questa zona',
  category: 'questo tipo di contenuto non è ammesso in questa zona',
  too_many: 'troppe aree in questa zona',
  empty_text: 'scrivi il testo',
}

export const DEFAULT_BASE = '#F4F4F2'

export function usesRoster(product: ProductDetail) {
  return (
    product.product_type === 'kit' ||
    product.sizes.length > 0 ||
    product.customization_areas.some((a) => a.area_type === 'text' || a.area_type === 'number')
  )
}

/** Ricalcola qualità (dipende dalla scala applicata nell'area). */
export function assetQualityFor(asset: AssetRef, area: CustomizationArea, scale: number, settings: QualitySettings) {
  if (asset.isVector) return { quality: 'vector' as const, dpi: null }
  const fit = area.area_type === 'all_over' ? 'cover' : 'contain'
  const dpi = effectiveDpi(asset.width, asset.height, area.print_width_cm, area.print_height_cm, fit === 'cover' ? 1 : scale, fit)
  const quality = dpi >= settings.min_dpi ? 'ok' : dpi >= settings.warn_dpi ? 'warn' : 'poor'
  return { quality: quality as AssetRef['quality'], dpi }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

export interface ValidationIssue { section: string; message: string }

const kitKey = (kit: string | null | undefined) => kit ?? '_'
/** Chiave immagine della grafica all-over: `ao:<componente>:main` o `ao:<componente>:<pezzo>`. */
export const allOverKey = (kit: string | null | undefined, zone: SectionKey | 'main') => `ao:${kitKey(kit)}:${zone}`

/** Tutti i file all-over della configurazione con la loro chiave immagine. */
function allOverAssets(config: Configuration): [string, AssetRef][] {
  const out: [string, AssetRef][] = []
  for (const ao of config.allOver ?? []) {
    out.push([allOverKey(ao.kitItemId, 'main'), ao.asset])
    for (const [zone, a] of Object.entries(ao.overrides ?? {})) if (a) out.push([allOverKey(ao.kitItemId, zone as PrintZone), a])
  }
  return out
}

/** Dimensioni in cm (larghezza, altezza) del contorno di un pezzo in mm. */
function pieceCm(piece: ZonePiece) {
  const xs = piece.outline.map((p) => p[0]), ys = piece.outline.map((p) => p[1])
  return { w: (Math.max(...xs) - Math.min(...xs)) / 10, h: (Math.max(...ys) - Math.min(...ys)) / 10 }
}

export function useConfigurator(
  product: ProductDetail,
  opts: { initial?: Configuration | null; userId: string | null; quality: QualitySettings; initialQuantity?: number; initialVariantId?: string | null; zones?: ZonePiece[]; techniques?: PrintTechnique[] },
) {
  const roster = usesRoster(product)
  const [config, setConfig] = useState<Configuration>(() => {
    if (opts.initial) return { ...emptyConfiguration(), ...opts.initial }
    const c = emptyConfiguration()
    c.garmentTypeId = product.product_garment_types?.[0]?.garment_type_id ?? null
    // colore scelto nella pagina prodotto (se valido), altrimenti il primo attivo
    c.variantId = product.product_variants.find((v) => v.is_active && v.id === opts.initialVariantId)?.id
      ?? product.product_variants.find((v) => v.is_active)?.id ?? null
    for (const o of product.product_options) {
      if (o.is_required && o.product_option_values?.[0]) c.optionValueIds.push(o.product_option_values[0].id)
    }
    for (const a of product.customization_areas) {
      if (a.area_type === 'text' || a.area_type === 'number') c.areas[a.id] = { enabled: a.is_required }
    }
    if (roster) {
      const rows = Math.max(1, product.min_quantity)
      c.roster = Array.from({ length: Math.min(rows, 30) }, () => ({ id: uid(), quantity: 1 }))
      if (rows > 30) c.roster[0].quantity = rows - 29
    }
    return c
  })
  const [quantity, setQuantity] = useState(Math.max(opts.initialQuantity ?? 1, product.min_quantity))
  const [activeKitItem, setActiveKitItem] = useState<string | null>(product.kit_items[0]?.id ?? null)
  const [view, setView] = useState<'front' | 'back'>('front')
  const [previewRow, setPreviewRow] = useState(0)
  const [highlightArea, setHighlightArea] = useState<string | null>(null)
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({})
  const [version, setVersion] = useState(0)
  const [guides, setGuides] = useState(true)

  const frontCanvas = useMemo(() => document.createElement('canvas'), [])
  const backCanvas = useMemo(() => document.createElement('canvas'), [])
  const sleeveLeftCanvas = useMemo(() => document.createElement('canvas'), [])
  const sleeveRightCanvas = useMemo(() => document.createElement('canvas'), [])

  const kitItem = product.kit_items.find((k) => k.id === activeKitItem) ?? null
  const firstKitItem = product.kit_items[0]?.id ?? null
  const shape: ModelShape = (kitItem?.model_shape ?? product.model_shape) as ModelShape

  /** Aree del componente attualmente visualizzato. */
  const areas = useMemo(() => {
    const active = product.customization_areas.filter((a) => a.is_active)
    if (product.product_type !== 'kit') return active
    return active.filter((a) => (a.kit_item_id ?? firstKitItem) === activeKitItem)
  }, [product, activeKitItem, firstKitItem])

  const variant = product.product_variants.find((v) => v.id === config.variantId) ?? null
  const baseColor = variant?.color_hex ?? config.baseColor ?? DEFAULT_BASE
  const secondaryColor = variant?.secondary_hex ?? null

  // Caricamento immagini delle aree ------------------------------------------------
  const assetKey = Object.entries(config.areas)
    .map(([id, a]) => `${id}:${a.enabled ? a.asset?.path ?? a.asset?.localKey ?? '' : ''}`)
    .concat((config.elements ?? []).map((e) => `el:${e.id}:${e.asset?.path ?? e.asset?.localKey ?? ''}`))
    .concat(allOverAssets(config).map(([k, a]) => `${k}:${a.path ?? a.localKey ?? ''}`))
    .concat((config.bands ?? []).map((b) => `band:${b.kitItemId ?? '_'}:${b.asset?.path ?? b.asset?.localKey ?? ''}`))
    .join('|')
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const next: Record<string, HTMLImageElement> = {}
      for (const b of config.bands ?? []) {
        if (b.mode !== 'graphic' || !b.asset) continue
        try {
          const url = await assetDisplayUrl(b.asset)
          if (url) next[`band:${b.kitItemId ?? '_'}`] = await loadImage(url)
        } catch { /* immagine non disponibile */ }
      }
      for (const [key, asset] of allOverAssets(config)) {
        try {
          const url = await assetDisplayUrl(asset)
          if (url) next[key] = await loadImage(url)
        } catch { /* immagine non disponibile */ }
      }
      for (const [id, a] of Object.entries(config.areas)) {
        if (!a.enabled || !a.asset) continue
        try {
          const url = await assetDisplayUrl(a.asset)
          if (url) next[id] = await loadImage(url)
        } catch { /* immagine non disponibile */ }
      }
      for (const e of config.elements ?? []) {
        if (!e.asset) continue
        try {
          const url = await assetDisplayUrl(e.asset)
          if (url) next[`el:${e.id}`] = await loadImage(url)
        } catch { /* immagine non disponibile */ }
      }
      if (!cancelled) setImages(next)
    })()
    return () => { cancelled = true }
  }, [assetKey])

  // Aree di stampa del cliente ------------------------------------------------------
  const zones = opts.zones ?? []
  const techniques = opts.techniques ?? []
  const elementKit = product.product_type === 'kit' ? activeKitItem : null
  const shapeOf = useCallback((kit: string | null) =>
    ((kit ? product.kit_items.find((k) => k.id === kit)?.model_shape : null) ?? product.model_shape) as ModelShape, [product])
  /** Pezzo della zona: quello del cartamodello o, in mancanza, un pezzo indicativo dalla sagoma. */
  const pieceFor = useCallback((zone: PrintZone, kit: string | null): ZonePiece =>
    zonePiece(zones, zone, kit) ?? virtualPiece(shapeOf(kit), zone, kit), [zones, shapeOf])
  /** Zone di stampa (area massima) del componente visualizzato. */
  const printZones = useMemo(() => (product.print_zones ?? []).filter((z) => (z.kit_item_id ?? null) === elementKit), [product.print_zones, elementKit])
  const printEnabled = printZones.length > 0
  const allOverAllowedFor = useCallback((kit: string | null) =>
    !!product.all_over_enabled && (!kit || product.kit_items.find((k) => k.id === kit)?.all_over_enabled !== false), [product])
  /** Tecniche ammesse in una zona (la sublimazione solo dove è consentito l'all-over). */
  const techniquesFor = useCallback((z: PrintZoneRow) => techniques.filter((t) =>
    t.is_active && z.techniques.includes(t.code) && (!t.all_over_only || allOverAllowedFor(z.kit_item_id ?? null))), [techniques, allOverAllowedFor])
  const elements = config.elements ?? []
  const elementImages = useMemo(() => {
    const out: Record<string, CanvasImageSource> = {}
    for (const e of elements) if (images[`el:${e.id}`]) out[e.id] = images[`el:${e.id}`]
    return withTextImages(elements, out)
  }, [elements, images])
  const silhouetteElements = useCallback((side: 'front' | 'back', forShape: ModelShape, kit: string | null) =>
    toSilhouette(forShape, side, elements.filter((e) => (e.kitItemId ?? null) === kit), pieceFor(side, kit), elementImages),
  [elements, pieceFor, elementImages])

  // Fasce su maniche o pantaloncino -------------------------------------------------
  const bandSource = product.product_type === 'kit' ? kitItem : product
  const bandEnabled = !!bandSource?.band_enabled
  const bandHeightCm = Number(bandSource?.band_height_cm ?? 4)
  const band = (config.bands ?? []).find((b) => (b.kitItemId ?? null) === elementKit) ?? null
  const isBottom = (s: ModelShape) => s === 'shorts' || s === 'track_pants'
  /** Fascia del componente indicato come immagine (colore pieno o grafica). */
  const bandImage = useCallback((kit: string | null): CanvasImageSource | null => {
    const b = (config.bands ?? []).find((x) => (x.kitItemId ?? null) === kit)
    if (!b) return null
    if (b.mode === 'color') return b.color ? solidImage(b.color) : null
    return images[`band:${kit ?? '_'}`] ?? null
  }, [config.bands, images])

  /** Rettangoli delle aree massime di stampa del lato indicato, in unità della sagoma (guide). */
  const zoneRectsFor = useCallback((side: 'front' | 'back') => printZones.filter((z) => z.zone === side).flatMap((z) => {
    const w = Number(z.width_cm), h = Number(z.height_cm)
    const pseudo: PlacedElement = { id: 'zone', kind: 'graphic', zone: side, kitItemId: elementKit, xCm: Number(z.x_cm) + w / 2, yCm: Number(z.y_cm) + h / 2, widthCm: w, heightCm: h, rotation: 0 }
    return toSilhouette(shape, side, [pseudo], pieceFor(side, elementKit), { zone: solidImage('#000000') }).map((r) => ({ cx: r.cx, cy: r.cy, w: r.w, h: r.h }))
  }), [printZones, elementKit, shape, pieceFor])

  // Grafica all-over ---------------------------------------------------------------
  // nei kit l'admin sceglie i componenti su cui è consentita (es. solo la maglia)
  const allOverEnabled = !!product.all_over_enabled && (product.product_type !== 'kit' || kitItem?.all_over_enabled !== false)
  const allOverKitCount = product.kit_items.filter((k) => k.all_over_enabled !== false).length
  const allOver = (config.allOver ?? []).find((x) => (x.kitItemId ?? null) === elementKit) ?? null
  /** Immagine all-over per un pezzo del componente indicato: la sostituzione, altrimenti la grafica del capo. */
  const allOverImage = useCallback((kit: string | null, zone: SectionKey): CanvasImageSource | null => {
    const ao = (config.allOver ?? []).find((x) => (x.kitItemId ?? null) === kit)
    if (!ao) return null
    const color = ao.colors?.[zone]
    if (color) return solidImage(color) // colore pieno al posto della grafica per questa sezione
    return (ao.overrides?.[zone] ? images[allOverKey(kit, zone)] : images[allOverKey(kit, 'main')]) ?? null
  }, [config.allOver, images])

  /**
   * Gambe del pantaloncino con grafica o colore diversi: metà sinistra e destra del pannello (viste
   * dall'esterno). Davanti la metà sinistra è la gamba destra di chi indossa, dietro la sinistra.
   */
  const legHalves = useCallback((kit: string | null, side: 'front' | 'back') => {
    const ao = (config.allOver ?? []).find((x) => (x.kitItemId ?? null) === kit)
    if (!ao) return null
    const pick = (leg: 'leg_left' | 'leg_right') => (ao.overrides?.[leg] || ao.colors?.[leg] ? allOverImage(kit, leg) : null)
    const left = pick(side === 'front' ? 'leg_right' : 'leg_left'), right = pick(side === 'front' ? 'leg_left' : 'leg_right')
    return left || right ? { left, right } : null
  }, [config.allOver, allOverImage])

  // Ridisegno pannelli --------------------------------------------------------------
  const row = config.roster[Math.min(previewRow, Math.max(0, config.roster.length - 1))]
  const buildLayers = useCallback(
    (forAreas: CustomizationArea[]): PanelLayer[] =>
      forAreas.map((area) => {
        const a = config.areas[area.id]
        const layer: PanelLayer = { area, scale: a?.scale ?? 1 }
        if (!a?.enabled) return layer
        if (area.area_type === 'text') layer.text = (row?.name || a.text || '').toUpperCase()
        else if (area.area_type === 'number') layer.text = row?.number || ''
        else layer.image = images[area.id] ?? null
        return layer
      }),
    [config.areas, images, row],
  )

  useEffect(() => {
    let cancelled = false
    // Le modifiche ravvicinate (es. digitazione) vengono raggruppate: si disegna solo l'ultimo stato
    const timer = setTimeout(() => {
      void ensureFonts().then(() => {
        if (cancelled) return
        const layers = buildLayers(areas)
        // pannelli usati anche come texture 3D: senza ombreggiatura del contorno (la aggiunge la vista
        // piana) e con le guide solo sul lato inquadrato, così sui fianchi del modello, dove davanti e
        // dietro si fondono, non compaiono le guide dell'altro lato
        const hemBand = isBottom(shape) && bandImage(elementKit)
          ? { image: bandImage(elementKit)!, height: bandHeightCm * 10 * silhouetteUnitsPerMm(shape) } : null
        const common = { shape, baseColor, secondaryColor, layers, textStyle: config.textStyle!, highlightId: highlightArea, edges: false, hemBand }
        const legs = (side: 'front' | 'back') => isBottom(shape) ? legHalves(elementKit, side) : null
        drawPanel(frontCanvas, { ...common, side: 'front', guides: guides && view === 'front', allOver: allOverImage(elementKit, 'front'), allOverHalves: legs('front'), elements: silhouetteElements('front', shape, elementKit), zoneRects: guides ? zoneRectsFor('front') : [] }, LIVE_PANEL_WIDTH)
        drawPanel(backCanvas, { ...common, side: 'back', guides: guides && view === 'back', allOver: allOverImage(elementKit, 'back'), allOverHalves: legs('back'), elements: silhouetteElements('back', shape, elementKit), zoneRects: guides ? zoneRectsFor('back') : [] }, LIVE_PANEL_WIDTH)
        for (const [zone, canvas] of [['sleeve_left', sleeveLeftCanvas], ['sleeve_right', sleeveRightCanvas]] as const) {
          // maniche: pezzo del cartamodello o pezzo indicativo; fascia sul fondo manica (capi superiori)
          const sleeveBand = !isBottom(shape) ? bandImage(elementKit) : null
          drawSleeve(canvas, pieceFor(zone, elementKit), elements.filter((e) => e.zone === zone && (e.kitItemId ?? null) === elementKit), elementImages,
            allOverImage(elementKit, zone), sleeveBand ? { image: sleeveBand, heightMm: bandHeightCm * 10 } : null)
        }
        setVersion((v) => v + 1)
      })
    }, 16)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [areas, buildLayers, shape, baseColor, secondaryColor, config.textStyle, guides, view, highlightArea, frontCanvas, backCanvas, silhouetteElements, elementKit, pieceFor, elements, elementImages, sleeveLeftCanvas, sleeveRightCanvas, allOverImage, bandImage, bandHeightCm, zoneRectsFor, legHalves])

  // Azioni --------------------------------------------------------------------------
  const patch = useCallback((p: Partial<Configuration>) => setConfig((c) => ({ ...c, ...p })), [])

  const setArea = useCallback((areaId: string, next: Partial<AreaConfig> | null) => {
    setConfig((c) => {
      const areasNext = { ...c.areas }
      if (next === null) delete areasNext[areaId]
      else areasNext[areaId] = { ...(areasNext[areaId] ?? { enabled: false }), ...next }
      return { ...c, areas: areasNext }
    })
  }, [])

  const toggleOption = useCallback((optionId: string, valueId: string, multiple: boolean) => {
    const opt = product.product_options.find((o) => o.id === optionId)
    const optValueIds = new Set((opt?.product_option_values ?? []).map((v) => v.id))
    setConfig((c) => {
      let ids = c.optionValueIds
      if (multiple) ids = ids.includes(valueId) ? ids.filter((i) => i !== valueId) : [...ids, valueId]
      else ids = [...ids.filter((i) => !optValueIds.has(i)), ...(ids.includes(valueId) && !opt?.is_required ? [] : [valueId])]
      return { ...c, optionValueIds: ids }
    })
  }, [product.product_options])

  /** Upload di una grafica con controllo qualità. Restituisce il report per la UI. */
  const uploadGraphic = useCallback(async (area: CustomizationArea, file: File) => {
    setUploading((u) => ({ ...u, [area.id]: true }))
    try {
      const info = await readImageInfo(file)
      const report = evaluateQuality(info, area, opts.quality)
      if (report.blocking) return report
      const stored = await storeGraphic(file, opts.userId)
      const asset: AssetRef = {
        ...stored,
        name: file.name.slice(0, 120),
        mime: info.mime,
        width: info.width,
        height: info.height,
        sizeBytes: info.sizeBytes,
        isVector: info.isVector,
        effectiveDpi: report.effectiveDpi,
        metadataDpi: report.metadataDpi,
        quality: report.quality,
        acknowledgedLowQuality: false,
      }
      setArea(area.id, { enabled: true, asset, scale: 1 })
      setHighlightArea(null)
      setView(area.side)
      return report
    } finally {
      setUploading((u) => ({ ...u, [area.id]: false }))
    }
  }, [opts.quality, opts.userId, setArea])

  const pickLibraryAsset = useCallback((area: CustomizationArea, asset: CustomizationAsset) => {
    const w = asset.width ?? 0
    const h = asset.height ?? 0
    const isVector = asset.storage_path.toLowerCase().endsWith('.svg')
    const ref: AssetRef = {
      bucket: PUBLIC_BUCKET,
      path: asset.storage_path,
      libraryAssetId: asset.id,
      name: asset.name,
      mime: isVector ? 'image/svg+xml' : 'image/png',
      width: w,
      height: h,
      sizeBytes: 0,
      isVector: isVector || !w,
      effectiveDpi: null,
      metadataDpi: null,
      quality: isVector || !w ? 'vector' : 'ok',
    }
    if (!ref.isVector) {
      const q = assetQualityFor(ref, area, 1, opts.quality)
      ref.quality = q.quality
      ref.effectiveDpi = q.dpi
    }
    setArea(area.id, { enabled: true, asset: ref, scale: 1 })
    setView(area.side)
  }, [opts.quality, setArea])

  const [selectedElement, setSelectedElement] = useState<string | null>(null)
  const [elementUploading, setElementUploading] = useState(false)

  /** Qualità di un'area alla sua dimensione di stampa (i testi sono vettoriali). */
  const elementQuality = useCallback((e: Pick<PlacedElement, 'widthCm' | 'asset' | 'kind'>): AssetRef['quality'] => {
    if (e.kind === 'text' || !e.asset) return 'vector'
    const dpi = elementDpi(e)
    if (dpi == null) return 'vector'
    return dpi >= opts.quality.min_dpi ? 'ok' : dpi >= opts.quality.warn_dpi ? 'warn' : 'poor'
  }, [opts.quality])

  /**
   * Modifica un'area. Con le proporzioni bloccate (predefinito per le grafiche) larghezza e
   * altezza cambiano insieme; cambiando dimensione la conferma sulla qualità va ripetuta.
   */
  const updateElement = useCallback((id: string, p: Partial<PlacedElement>) => {
    setConfig((c) => ({ ...c, elements: (c.elements ?? []).map((e) => {
      if (e.id !== id) return e
      const next = { ...e, ...p }
      const h0 = heightOf(e)
      const lock = e.kind !== 'text' && e.lockRatio !== false
      if (p.widthCm != null) {
        next.widthCm = Math.max(0.5, Math.round(p.widthCm * 10) / 10)
        if (lock && p.heightCm == null) next.heightCm = Math.max(0.5, Math.round(((h0 * next.widthCm) / e.widthCm) * 10) / 10)
      }
      if (p.heightCm != null) {
        next.heightCm = Math.max(0.5, Math.round(p.heightCm * 10) / 10)
        if (lock && p.widthCm == null) next.widthCm = Math.max(0.5, Math.round(((e.widthCm * next.heightCm) / h0) * 10) / 10)
      }
      if ((p.widthCm != null || p.heightCm != null) && next.asset && (next.widthCm !== e.widthCm || next.heightCm !== e.heightCm)) {
        next.asset = { ...next.asset, acknowledgedLowQuality: false }
      }
      return next
    }) }))
  }, [])

  const removeElement = useCallback((id: string) => {
    setConfig((c) => ({ ...c, elements: (c.elements ?? []).filter((e) => e.id !== id) }))
    setSelectedElement((s) => (s === id ? null : s))
  }, [])

  /** Centra un'area nell'area massima della sua zona, in orizzontale o in verticale. */
  const centerElement = useCallback((id: string, axis: 'x' | 'y') => {
    const e = (config.elements ?? []).find((x) => x.id === id)
    const z = e ? findZone(product.print_zones ?? [], e.zone, e.kitItemId) : null
    if (e && z) updateElement(id, centerIn(zoneBox(z), axis))
  }, [config.elements, product.print_zones, updateElement])

  /**
   * Aree fisse dell'admin (loghi, sponsor, nomi, numeri) attivate dal cliente sul lato indicato, in
   * cm dal riferimento: le aree di stampa non possono sovrapporsi.
   */
  const blockedFor = useCallback((zone: PrintZone, kit: string | null): Box[] => {
    if (zone !== 'front' && zone !== 'back') return []
    const piece = pieceFor(zone, kit)
    const shp = shapeOf(kit)
    return product.customization_areas
      .filter((a) => a.is_active && a.area_type !== 'all_over' && a.side === zone && config.areas[a.id]?.enabled
        && (product.product_type !== 'kit' || (a.kit_item_id ?? firstKitItem) === kit))
      .map((a) => areaBoxCm(a, shp, piece))
      .filter((b): b is Box => !!b)
  }, [product, config.areas, pieceFor, shapeOf, firstKitItem])

  /**
   * Aggiunge un'area di stampa (grafica caricata o dalla libreria, oppure testo) nella zona
   * indicata, accanto (asse orizzontale) o sotto (asse verticale) all'ultima, finché c'è spazio
   * nell'area massima. La dimensione si adatta alle proporzioni della grafica.
   */
  const addElement = useCallback(async (
    kind: 'graphic' | 'text', zone: PrintZone, axis: 'x' | 'y', source?: { file: File } | { library: CustomizationAsset },
  ): Promise<{ error?: string; report?: QualityReport; element?: PlacedElement }> => {
    const z = findZone(product.print_zones ?? [], zone, elementKit)
    if (!z) return { error: 'Questa zona non prevede aree di stampa.' }
    if (kind === 'text' && !z.allow_text) return { error: 'In questa zona non si possono inserire testi.' }
    if (kind === 'graphic' && !z.allow_graphic) return { error: 'In questa zona non si possono inserire grafiche.' }
    const existing = (config.elements ?? []).filter((e) => e.technique && e.zone === zone && (e.kitItemId ?? null) === elementKit)
    if (existing.length >= z.max_items) return { error: `In questa zona puoi inserire al massimo ${z.max_items} ${z.max_items === 1 ? 'area' : 'aree'}.` }
    const tech = techniquesFor(z)[0]
    if (!tech) return { error: 'Nessuna tecnica di stampa disponibile per questa zona.' }
    const zb = zoneBox(z)

    let asset: AssetRef | undefined
    let ratio = kind === 'text' ? 0.25 : 1
    if (kind === 'graphic' && source) {
      if ('file' in source) {
        setElementUploading(true)
        try {
          const info = await readImageInfo(source.file)
          ratio = info.width && info.height ? info.height / info.width : 1
          const w0 = Math.min(10, zb.x2 - zb.x1)
          const report = evaluateQuality(info, { print_width_cm: w0, print_height_cm: w0 * ratio, area_type: 'logo' }, opts.quality)
          if (report.blocking) return { report }
          const stored = await storeGraphic(source.file, opts.userId)
          asset = {
            ...stored, name: source.file.name.slice(0, 120), mime: info.mime, width: info.width, height: info.height, sizeBytes: info.sizeBytes,
            isVector: info.isVector, effectiveDpi: report.effectiveDpi, metadataDpi: report.metadataDpi, quality: report.quality, acknowledgedLowQuality: false,
          }
        } finally {
          setElementUploading(false)
        }
      } else {
        const a = source.library
        const isVector = a.storage_path.toLowerCase().endsWith('.svg') || !a.width
        ratio = a.width && a.height ? a.height / a.width : 1
        asset = {
          bucket: PUBLIC_BUCKET, path: a.storage_path, libraryAssetId: a.id, name: a.name, mime: isVector ? 'image/svg+xml' : 'image/png',
          width: a.width ?? 0, height: a.height ?? 0, sizeBytes: 0, isVector, effectiveDpi: null, metadataDpi: null, quality: isVector ? 'vector' : 'ok',
        }
      }
    }
    // dimensione iniziale: 10 cm di larghezza (fino a 20 per i testi), ridotta per stare nell'area massima
    const w0 = kind === 'text' ? Math.min(20, zb.x2 - zb.x1) : 10
    const size = fitSize(w0, w0 * ratio, zb)
    const slot = nextSlot(zb, existing, size.w, size.h, axis, blockedFor(zone, elementKit))
    if (!slot) return { error: 'Non c’è più spazio nell’area di stampa: riduci o sposta le aree presenti (loghi, sponsor, nomi e numeri scelti occupano parte dell’area).' }
    const el: PlacedElement = {
      id: uid(), kind, zone, kitItemId: elementKit, xCm: slot.xCm, yCm: slot.yCm, widthCm: size.w, heightCm: size.h, rotation: 0,
      technique: tech.code, lockRatio: kind === 'graphic',
      ...(kind === 'graphic' ? { asset } : { text: 'Testo', font: 'block' as const, color: isDark(baseColor) ? '#FFFFFF' : '#111111' }),
    }
    if (el.asset) el.asset = { ...el.asset, quality: elementQuality(el), effectiveDpi: elementDpi(el) }
    setConfig((c) => ({ ...c, elements: [...(c.elements ?? []), el] }))
    setSelectedElement(el.id)
    if (zone === 'front' || zone === 'back') setView(zone)
    return { element: el }
  }, [product.print_zones, config.elements, elementKit, techniquesFor, opts.quality, opts.userId, baseColor, elementQuality, blockedFor])

  /** Sostituisce la grafica di un'area mantenendo posizione e larghezza (altezza dalle nuove proporzioni). */
  const replaceElementAsset = useCallback(async (id: string, file: File): Promise<{ error?: string; report?: QualityReport }> => {
    const e = (config.elements ?? []).find((x) => x.id === id)
    if (!e) return { error: 'Area non trovata.' }
    setElementUploading(true)
    try {
      const info = await readImageInfo(file)
      const ratio = info.width && info.height ? info.height / info.width : 1
      const report = evaluateQuality(info, { print_width_cm: e.widthCm, print_height_cm: e.widthCm * ratio, area_type: 'logo' }, opts.quality)
      if (report.blocking) return { report }
      const stored = await storeGraphic(file, opts.userId)
      const asset: AssetRef = {
        ...stored, name: file.name.slice(0, 120), mime: info.mime, width: info.width, height: info.height, sizeBytes: info.sizeBytes,
        isVector: info.isVector, effectiveDpi: report.effectiveDpi, metadataDpi: report.metadataDpi, quality: report.quality, acknowledgedLowQuality: false,
      }
      setConfig((c) => ({ ...c, elements: (c.elements ?? []).map((x) => (x.id === id ? { ...x, asset, heightCm: Math.round(x.widthCm * ratio * 10) / 10 } : x)) }))
      return {}
    } finally {
      setElementUploading(false)
    }
  }, [config.elements, opts.quality, opts.userId])

  // Fasce: azioni -------------------------------------------------------------------
  const setBand = useCallback((next: Omit<BandConfig, 'kitItemId'> | null) => {
    setConfig((c) => {
      const rest = (c.bands ?? []).filter((b) => (b.kitItemId ?? null) !== elementKit)
      return { ...c, bands: next ? [...rest, { ...next, kitItemId: elementKit }] : rest }
    })
  }, [elementKit])

  const uploadBand = useCallback(async (file: File) => {
    const info = await readImageInfo(file)
    const report = evaluateQuality(info, { print_width_cm: 40, print_height_cm: bandHeightCm, area_type: 'all_over' }, opts.quality)
    if (report.blocking) return report
    const stored = await storeGraphic(file, opts.userId)
    setBand({ mode: 'graphic', asset: {
      ...stored, name: file.name.slice(0, 120), mime: info.mime, width: info.width, height: info.height, sizeBytes: info.sizeBytes,
      isVector: info.isVector, effectiveDpi: report.effectiveDpi, metadataDpi: report.metadataDpi, quality: report.quality, acknowledgedLowQuality: true,
    } })
    return report
  }, [bandHeightCm, opts.quality, opts.userId, setBand])

  // Grafica all-over: azioni e qualità -------------------------------------------------
  const [allOverUploading, setAllOverUploading] = useState<SectionKey | 'main' | null>(null)
  /** Pezzi del componente visualizzato (taglia di riferimento del cartamodello), se caricati. */
  const allOverPieces = useMemo(
    () => (['front', 'back', 'sleeve_left', 'sleeve_right', 'leg_left', 'leg_right'] as SectionKey[]).map((z) => zonePiece(zones, z, elementKit)).filter((p): p is ZonePiece => !!p),
    [zones, elementKit],
  )
  /**
   * Sezioni personalizzabili: per i capi superiori davanti e dietro sempre e le maniche se esiste il
   * loro pezzo; per pantaloncini e pantaloni le due gambe.
   */
  const allOverZones = useMemo<SectionKey[]>(
    () => isBottom(shape) ? ['leg_left', 'leg_right']
      : ['front', 'back', ...(['sleeve_left', 'sleeve_right'] as SectionKey[]).filter((z) => allOverPieces.some((p) => p.zone === z))],
    [allOverPieces, shape],
  )

  /** Colore pieno al posto della grafica per una sezione (null lo toglie). */
  const setAllOverColor = useCallback((zone: SectionKey, color: string | null) => {
    setConfig((c) => {
      const list = [...(c.allOver ?? [])]
      const i = list.findIndex((x) => (x.kitItemId ?? null) === elementKit)
      if (i < 0) return c
      const colors = { ...(list[i].colors ?? {}) }
      const overrides = { ...(list[i].overrides ?? {}) }
      if (color) { colors[zone] = color; delete overrides[zone] } else delete colors[zone]
      list[i] = { ...list[i], colors, overrides }
      return { ...c, allOver: list }
    })
  }, [elementKit])

  /** DPI minimi della grafica sui pezzi che la usano; null se vettoriale o senza cartamodello. */
  const allOverDpi = useCallback((asset: AssetRef, zone: SectionKey | 'main', overrides = allOver?.overrides): number | null => {
    if (asset.isVector || !asset.width || !asset.height) return null
    const target = zone === 'main' ? allOverPieces.filter((p) => !overrides?.[p.zone]) : allOverPieces.filter((p) => p.zone === zone)
    if (!target.length) return null
    return Math.min(...target.map((p) => { const c = pieceCm(p); return effectiveDpi(asset.width, asset.height, c.w, c.h, 1, 'cover') }))
  }, [allOverPieces, allOver])

  const allOverQuality = useCallback((asset: AssetRef, zone: SectionKey | 'main'): { quality: AssetRef['quality']; dpi: number | null } => {
    if (asset.isVector) return { quality: 'vector', dpi: null }
    const dpi = allOverDpi(asset, zone)
    if (dpi == null) return { quality: 'ok', dpi: null }
    return { quality: dpi >= opts.quality.min_dpi ? 'ok' : dpi >= opts.quality.warn_dpi ? 'warn' : 'poor', dpi }
  }, [allOverDpi, opts.quality])

  /** Imposta o rimuove (asset null) la grafica del capo o la sostituzione di un pezzo, per il componente visualizzato. */
  const setAllOverAsset = useCallback((zone: SectionKey | 'main', asset: AssetRef | null) => {
    setConfig((c) => {
      const list = [...(c.allOver ?? [])]
      const i = list.findIndex((x) => (x.kitItemId ?? null) === elementKit)
      if (zone === 'main') {
        if (!asset) return { ...c, allOver: list.filter((_, j) => j !== i) }
        const entry = { ...(i >= 0 ? list[i] : {}), kitItemId: elementKit, asset }
        if (i >= 0) list[i] = entry
        else list.push(entry)
        return { ...c, allOver: list }
      }
      if (i < 0) return c
      const overrides = { ...(list[i].overrides ?? {}) }
      const colors = { ...(list[i].colors ?? {}) }
      if (asset) { overrides[zone] = asset; delete colors[zone] } else delete overrides[zone]
      list[i] = { ...list[i], overrides, colors }
      return { ...c, allOver: list }
    })
    if (zone === 'front' || zone === 'back') setView(zone)
  }, [elementKit])

  /** Carica una grafica all-over (per il capo o per un pezzo) con controllo del file. */
  const uploadAllOver = useCallback(async (zone: SectionKey | 'main', file: File) => {
    setAllOverUploading(zone)
    try {
      const info = await readImageInfo(file)
      // controllo del formato e dei limiti del file; la risoluzione si valuta sui pezzi reali
      const ref = allOverPieces.find((p) => zone === 'main' || p.zone === zone)
      const size = ref ? pieceCm(ref) : { w: 1, h: 1 }
      const report = evaluateQuality(info, { print_width_cm: size.w, print_height_cm: size.h, area_type: 'all_over' }, opts.quality)
      if (report.blocking) return report
      const stored = await storeGraphic(file, opts.userId)
      const asset: AssetRef = {
        ...stored, name: file.name.slice(0, 120), mime: info.mime, width: info.width, height: info.height, sizeBytes: info.sizeBytes,
        isVector: info.isVector, effectiveDpi: null, metadataDpi: report.metadataDpi, quality: 'ok', acknowledgedLowQuality: false,
      }
      const q = allOverQuality(asset, zone)
      setAllOverAsset(zone, { ...asset, quality: q.quality, effectiveDpi: q.dpi })
      return report
    } finally {
      setAllOverUploading(null)
    }
  }, [allOverPieces, allOverQuality, opts.quality, opts.userId, setAllOverAsset])

  const pickAllOverLibrary = useCallback((zone: SectionKey | 'main', a: CustomizationAsset) => {
    const isVector = a.storage_path.toLowerCase().endsWith('.svg') || !a.width
    const asset: AssetRef = {
      bucket: PUBLIC_BUCKET, path: a.storage_path, libraryAssetId: a.id, name: a.name, mime: isVector ? 'image/svg+xml' : 'image/png',
      width: a.width ?? 0, height: a.height ?? 0, sizeBytes: 0, isVector, effectiveDpi: null, metadataDpi: null, quality: isVector ? 'vector' : 'ok',
    }
    const q = allOverQuality(asset, zone)
    setAllOverAsset(zone, { ...asset, quality: q.quality, effectiveDpi: q.dpi })
  }, [allOverQuality, setAllOverAsset])

  const setRoster = useCallback((rows: RosterEntry[]) => setConfig((c) => ({ ...c, roster: rows })), [])
  const setTextStyle = useCallback((s: Partial<TextStyle>) => setConfig((c) => ({ ...c, textStyle: { ...c.textStyle!, ...s } })), [])

  // Derivati ------------------------------------------------------------------------
  const qty = roster ? configQuantity(config, 1) : quantity
  const price = useMemo(() => computePrice(product, config, qty, opts.techniques ?? []), [product, config, qty, opts.techniques])

  const qualityIssues = useMemo(() => {
    const out: { area: CustomizationArea; asset: AssetRef; quality: AssetRef['quality']; dpi: number | null }[] = []
    for (const area of product.customization_areas) {
      const a = config.areas[area.id]
      if (!a?.enabled || !a.asset) continue
      const q = assetQualityFor(a.asset, area, a.scale ?? 1, opts.quality)
      if (q.quality === 'warn' || q.quality === 'poor') out.push({ area, asset: a.asset, quality: q.quality, dpi: q.dpi })
    }
    return out
  }, [product.customization_areas, config.areas, opts.quality])

  const issues = useMemo<ValidationIssue[]>(() => {
    const out: ValidationIssue[] = []
    if (product.product_garment_types?.length && !config.garmentTypeId) out.push({ section: 'garment', message: 'Seleziona la tipologia di capo.' })
    if (product.product_variants.length && !config.variantId) out.push({ section: 'color', message: 'Seleziona il colore.' })
    for (const o of product.product_options) {
      if (o.is_required && !(o.product_option_values ?? []).some((v) => config.optionValueIds.includes(v.id))) {
        out.push({ section: 'options', message: `Seleziona: ${o.name}.` })
      }
    }
    for (const a of product.customization_areas) {
      const ac = config.areas[a.id]
      if (!a.is_active || !a.is_required) continue
      if (!ac?.enabled || ((a.area_type !== 'text' && a.area_type !== 'number') && !ac.asset)) {
        out.push({ section: 'graphics', message: `Personalizzazione obbligatoria: ${a.name}.` })
      }
    }
    for (const q of qualityIssues) {
      if (!config.areas[q.area.id]?.asset?.acknowledgedLowQuality) {
        out.push({ section: 'graphics', message: `Conferma di aver preso visione della qualità della grafica "${q.area.name}".` })
      }
    }
    for (const ao of config.allOver ?? []) {
      const comp = product.kit_items.find((k) => k.id === ao.kitItemId)?.label
      const label = `Grafica all-over${comp ? ` (${comp})` : ''}`
      for (const [zone, a] of [['main', ao.asset] as const, ...Object.entries(ao.overrides ?? {})]) {
        if (a && (a.quality === 'warn' || a.quality === 'poor') && !a.acknowledgedLowQuality) {
          out.push({ section: 'allover', message: `${label}${zone === 'main' ? '' : `, ${SECTION_LABEL[zone as SectionKey].toLowerCase()}`}: conferma di aver preso visione della qualità della grafica.` })
        }
      }
    }
    const els = config.elements ?? []
    for (const [i, e] of els.entries()) {
      const comp = product.kit_items.find((k) => k.id === e.kitItemId)?.label
      const label = `${elementLabel(e, i)} (${ZONE_LABEL[e.zone].toLowerCase()}${comp ? `, ${comp}` : ''})`
      for (const issue of elementIssues(e, els, product.print_zones ?? [], opts.techniques ?? [], allOverAllowedFor(e.kitItemId ?? null), blockedFor(e.zone, e.kitItemId ?? null))) {
        out.push({ section: 'elements', message: `${label}: ${ISSUE_TEXT[issue]}.` })
      }
      const q = elementQuality(e)
      if ((q === 'warn' || q === 'poor') && e.asset && !e.asset.acknowledgedLowQuality) out.push({ section: 'elements', message: `${label}: conferma di aver preso visione della qualità della grafica.` })
    }
    for (const b of config.bands ?? []) {
      if (b.mode === 'graphic' && !b.asset) {
        const comp = product.kit_items.find((k) => k.id === b.kitItemId)?.label
        out.push({ section: 'bands', message: `Fascia${comp ? ` (${comp})` : ''}: carica la grafica o scegli un colore.` })
      }
    }
    if (roster) {
      if (!config.roster.length) out.push({ section: 'roster', message: 'Aggiungi almeno un capo.' })
      const needSize = product.product_type === 'simple' && product.sizes.length > 0
      config.roster.forEach((r, i) => {
        if (needSize && !r.size) out.push({ section: 'roster', message: `Riga ${i + 1}: seleziona la taglia.` })
        if (product.product_type === 'kit') {
          for (const k of product.kit_items) {
            if (k.sizes.length && !r.sizes?.[k.id]) out.push({ section: 'roster', message: `Riga ${i + 1}: taglia ${k.label}.` })
          }
        }
      })
    }
    if (qty < product.min_quantity) out.push({ section: 'roster', message: `Quantità minima: ${product.min_quantity} pezzi.` })
    return out
  }, [product, config, roster, qty, qualityIssues, opts.zones, elementQuality])

  /** Anteprime piane fronte/retro senza guide, da salvare con l'ordine. */
  const renderPreviews = useCallback(async () => {
    await ensureFonts()
    const layers = buildLayers(product.product_type === 'kit'
      ? product.customization_areas.filter((a) => a.is_active && (a.kit_item_id ?? firstKitItem) === (firstKitItem))
      : product.customization_areas.filter((a) => a.is_active))
    const mainShape = (product.kit_items[0]?.model_shape ?? product.model_shape) as ModelShape
    const mainBottom = isBottom(mainShape)
    const hem = mainBottom ? bandImage(product.product_type === 'kit' ? firstKitItem : null) : null
    const common = {
      shape: mainShape, baseColor, secondaryColor, layers, textStyle: config.textStyle!, guides: false,
      hemBand: hem ? { image: hem, height: Number((product.product_type === 'kit' ? product.kit_items[0] : product)?.band_height_cm ?? 4) * 10 * silhouetteUnitsPerMm(mainShape) } : null,
    }
    const f = document.createElement('canvas')
    const b = document.createElement('canvas')
    const mainKit = product.product_type === 'kit' ? firstKitItem : null
    drawPanel(f, { ...common, side: 'front', allOver: allOverImage(mainKit, 'front'), allOverHalves: mainBottom ? legHalves(mainKit, 'front') : null, elements: silhouetteElements('front', mainShape, mainKit) }, 1024)
    drawPanel(b, { ...common, side: 'back', allOver: allOverImage(mainKit, 'back'), allOverHalves: mainBottom ? legHalves(mainKit, 'back') : null, elements: silhouetteElements('back', mainShape, mainKit) }, 1024)
    const out: Partial<Record<'front' | 'back' | 'sleeveLeft' | 'sleeveRight', Blob>> = {}
    const [front, back] = await Promise.all([canvasToBlob(f), canvasToBlob(b)])
    if (front) out.front = front
    if (back) out.back = back
    // maniche: solo se hanno aree di stampa, grafica all-over o fascia (pezzo con colore di fondo)
    const mainBand = !isBottom(mainShape) ? bandImage(mainKit) : null
    for (const [zone, key] of [['sleeve_left', 'sleeveLeft'], ['sleeve_right', 'sleeveRight']] as const) {
      const piece = pieceFor(zone, mainKit)
      const els = elements.filter((e) => e.zone === zone && (e.kitItemId ?? null) === mainKit)
      const fill = allOverImage(mainKit, zone)
      if (!els.length && !fill && !mainBand) continue
      const blob = await canvasToBlob(drawSleevePreview(piece, els, elementImages, baseColor, fill, mainBand ? { image: mainBand, heightMm: bandHeightCm * 10 } : null))
      if (blob) out[key] = blob
    }
    return out
  }, [buildLayers, product, firstKitItem, baseColor, secondaryColor, config.textStyle, silhouetteElements, pieceFor, elements, elementImages, allOverImage, bandImage, bandHeightCm, legHalves])

  return {
    product, config, setConfig, patch, setArea, toggleOption, uploadGraphic, pickLibraryAsset, setRoster, setTextStyle,
    roster, quantity, setQuantity, qty, price, issues, qualityIssues,
    kitItem, activeKitItem, setActiveKitItem, shape, areas, view, setView, previewRow, setPreviewRow,
    highlightArea, setHighlightArea, uploading, frontCanvas, backCanvas, version, guides, setGuides,
    baseColor, secondaryColor, renderPreviews,
    zones, elements, elementKit, selectedElement, setSelectedElement, pieceFor, blockedFor,
    printZones, printEnabled, techniques, techniquesFor,
    sleeveCanvases: {
      left: sleeveInfo(pieceFor('sleeve_left', elementKit), sleeveLeftCanvas),
      right: sleeveInfo(pieceFor('sleeve_right', elementKit), sleeveRightCanvas),
    },
    addElement, updateElement, removeElement, centerElement, replaceElementAsset, elementQuality, elementUploading, elementHeightCm,
    bandEnabled, bandHeightCm, band, setBand, uploadBand, isBottomShape: isBottom(shape),
    allOverEnabled, allOverKitCount, allOver, allOverZones, allOverPieces, allOverUploading, allOverQuality,
    setAllOverAsset, setAllOverColor, uploadAllOver, pickAllOverLibrary,
  }
}

export type ConfiguratorApi = ReturnType<typeof useConfigurator>
