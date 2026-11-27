import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AssetRef, AreaConfig, Configuration, PlacedElement, PrintZone, RosterEntry, TextStyle } from '@/types/config'
import { emptyConfiguration } from '@/types/config'
import type { CustomizationArea, CustomizationAsset, ModelShape, ProductDetail, QualitySettings } from '@/types/db'
import { computePrice, configQuantity } from '@/lib/pricing'
import { evaluateQuality, effectiveDpi, readImageInfo } from '@/lib/imageQuality'
import { uid } from '@/lib/slug'
import { PUBLIC_BUCKET } from '@/lib/storage'
import { assetDisplayUrl, storeGraphic } from '@/features/cart/assets'
import { canvasToBlob, drawPanel, ensureFonts, LIVE_PANEL_WIDTH, type PanelLayer } from './garment/panel'
import { drawSleeve, drawSleevePreview, sleeveInfo, toSilhouette } from './garment/elements'
import { elementDpi, elementHeightCm, placementIssue, zonePiece, ZONE_LABEL, type ZonePiece } from '@/lib/patterns/placement'

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
export const allOverKey = (kit: string | null | undefined, zone: PrintZone | 'main') => `ao:${kitKey(kit)}:${zone}`

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
  opts: { initial?: Configuration | null; userId: string | null; quality: QualitySettings; initialQuantity?: number; initialVariantId?: string | null; zones?: ZonePiece[] },
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
    .concat((config.elements ?? []).map((e) => `el:${e.id}:${e.asset.path ?? e.asset.localKey ?? ''}`))
    .concat(allOverAssets(config).map(([k, a]) => `${k}:${a.path ?? a.localKey ?? ''}`))
    .join('|')
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const next: Record<string, HTMLImageElement> = {}
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
        try {
          const url = await assetDisplayUrl(e.asset)
          if (url) next[`el:${e.id}`] = await loadImage(url)
        } catch { /* immagine non disponibile */ }
      }
      if (!cancelled) setImages(next)
    })()
    return () => { cancelled = true }
  }, [assetKey])

  // Loghi e sponsor liberi ---------------------------------------------------------
  const zones = opts.zones ?? []
  const elementKit = product.product_type === 'kit' ? activeKitItem : null
  const freeMax = Number(product.free_elements_max ?? 0)
  /** Zone consentite che hanno un pezzo nel cartamodello del componente visualizzato. */
  const freeZones = useMemo(() => (product.free_zones ?? ['front', 'back', 'sleeve_left', 'sleeve_right'])
    .filter((z) => zonePiece(zones, z, elementKit)) as PrintZone[], [product.free_zones, zones, elementKit])
  const freeEnabled = freeMax > 0 && freeZones.length > 0
  const elements = config.elements ?? []
  const elementImages = useMemo(() => {
    const out: Record<string, CanvasImageSource> = {}
    for (const e of elements) if (images[`el:${e.id}`]) out[e.id] = images[`el:${e.id}`]
    return out
  }, [elements, images])
  const silhouetteElements = useCallback((side: 'front' | 'back', forShape: ModelShape, kit: string | null) =>
    toSilhouette(forShape, side, elements.filter((e) => (e.kitItemId ?? null) === kit), zonePiece(zones, side, kit), elementImages),
  [elements, zones, elementImages])

  // Grafica all-over ---------------------------------------------------------------
  // nei kit l'admin sceglie i componenti su cui è consentita (es. solo la maglia)
  const allOverEnabled = !!product.all_over_enabled && (product.product_type !== 'kit' || kitItem?.all_over_enabled !== false)
  const allOverKitCount = product.kit_items.filter((k) => k.all_over_enabled !== false).length
  const allOver = (config.allOver ?? []).find((x) => (x.kitItemId ?? null) === elementKit) ?? null
  /** Immagine all-over per un pezzo del componente indicato: la sostituzione, altrimenti la grafica del capo. */
  const allOverImage = useCallback((kit: string | null, zone: PrintZone): CanvasImageSource | null => {
    const ao = (config.allOver ?? []).find((x) => (x.kitItemId ?? null) === kit)
    if (!ao) return null
    return (ao.overrides?.[zone] ? images[allOverKey(kit, zone)] : images[allOverKey(kit, 'main')]) ?? null
  }, [config.allOver, images])

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
        const common = { shape, baseColor, secondaryColor, layers, textStyle: config.textStyle!, highlightId: highlightArea, edges: false }
        drawPanel(frontCanvas, { ...common, side: 'front', guides: guides && view === 'front', allOver: allOverImage(elementKit, 'front'), elements: silhouetteElements('front', shape, elementKit) }, LIVE_PANEL_WIDTH)
        drawPanel(backCanvas, { ...common, side: 'back', guides: guides && view === 'back', allOver: allOverImage(elementKit, 'back'), elements: silhouetteElements('back', shape, elementKit) }, LIVE_PANEL_WIDTH)
        for (const [zone, canvas] of [['sleeve_left', sleeveLeftCanvas], ['sleeve_right', sleeveRightCanvas]] as const) {
          const piece = zonePiece(zones, zone, elementKit)
          if (piece) drawSleeve(canvas, piece, elements.filter((e) => e.zone === zone && (e.kitItemId ?? null) === elementKit), elementImages, allOverImage(elementKit, zone))
        }
        setVersion((v) => v + 1)
      })
    }, 16)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [areas, buildLayers, shape, baseColor, secondaryColor, config.textStyle, guides, view, highlightArea, frontCanvas, backCanvas, silhouetteElements, elementKit, zones, elements, elementImages, sleeveLeftCanvas, sleeveRightCanvas, allOverImage])

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
  const minW = Number(product.free_min_width_cm ?? 2), maxW = Number(product.free_max_width_cm ?? 40)

  /** Qualità di un elemento alla sua larghezza di stampa attuale. */
  const elementQuality = useCallback((e: Pick<PlacedElement, 'widthCm' | 'asset'>): AssetRef['quality'] => {
    const dpi = elementDpi(e)
    if (dpi == null) return 'vector'
    return dpi >= opts.quality.min_dpi ? 'ok' : dpi >= opts.quality.warn_dpi ? 'warn' : 'poor'
  }, [opts.quality])

  const updateElement = useCallback((id: string, p: Partial<PlacedElement>) => {
    setConfig((c) => ({ ...c, elements: (c.elements ?? []).map((e) => {
      if (e.id !== id) return e
      const next = { ...e, ...p }
      if (p.widthCm != null) next.widthCm = Math.round(Math.min(maxW, Math.max(minW, p.widthCm)) * 10) / 10
      // cambiando dimensione la qualità va riconfermata
      if (p.widthCm != null && p.widthCm !== e.widthCm) next.asset = { ...next.asset, acknowledgedLowQuality: false }
      return next
    }) }))
  }, [minW, maxW])

  const removeElement = useCallback((id: string) => {
    setConfig((c) => ({ ...c, elements: (c.elements ?? []).filter((e) => e.id !== id) }))
    setSelectedElement((s) => (s === id ? null : s))
  }, [])

  /** Aggiunge un logo o uno sponsor da file caricato o dalla libreria. */
  const addElement = useCallback(async (kind: PlacedElement['kind'], zone: PrintZone, source: { file: File } | { library: CustomizationAsset }) => {
    if ((config.elements ?? []).length >= freeMax) return { error: `Puoi aggiungere al massimo ${freeMax} loghi e sponsor.` }
    const widthCm = Math.min(maxW, Math.max(minW, kind === 'logo' ? 8 : 20))
    let asset: AssetRef
    if ('file' in source) {
      setElementUploading(true)
      try {
        const info = await readImageInfo(source.file)
        const ratio = info.width && info.height ? info.height / info.width : 1
        const report = evaluateQuality(info, { print_width_cm: widthCm, print_height_cm: widthCm * ratio, area_type: kind }, opts.quality)
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
      asset = {
        bucket: PUBLIC_BUCKET, path: a.storage_path, libraryAssetId: a.id, name: a.name, mime: isVector ? 'image/svg+xml' : 'image/png',
        width: a.width ?? 0, height: a.height ?? 0, sizeBytes: 0, isVector, effectiveDpi: null, metadataDpi: null, quality: isVector ? 'vector' : 'ok',
      }
    }
    const el: PlacedElement = {
      id: uid(), kind, zone, kitItemId: elementKit, asset, widthCm,
      xCm: 0, yCm: zone === 'front' || zone === 'back' ? (kind === 'logo' ? 10 : 18) : 6, rotation: 0,
    }
    el.asset = { ...asset, quality: elementQuality(el), effectiveDpi: elementDpi(el) }
    setConfig((c) => ({ ...c, elements: [...(c.elements ?? []), el] }))
    setSelectedElement(el.id)
    if (zone === 'front' || zone === 'back') setView(zone)
    return { element: el }
  }, [config.elements, freeMax, minW, maxW, opts.quality, opts.userId, elementKit, elementQuality])

  // Grafica all-over: azioni e qualità -------------------------------------------------
  const [allOverUploading, setAllOverUploading] = useState<PrintZone | 'main' | null>(null)
  /** Pezzi del componente visualizzato (taglia di riferimento del cartamodello), se caricati. */
  const allOverPieces = useMemo(
    () => (['front', 'back', 'sleeve_left', 'sleeve_right'] as PrintZone[]).map((z) => zonePiece(zones, z, elementKit)).filter((p): p is ZonePiece => !!p),
    [zones, elementKit],
  )
  /** Pezzi sostituibili: davanti e dietro sempre, le maniche solo se esiste il loro pezzo. */
  const allOverZones = useMemo<PrintZone[]>(
    () => ['front', 'back', ...(['sleeve_left', 'sleeve_right'] as PrintZone[]).filter((z) => allOverPieces.some((p) => p.zone === z))],
    [allOverPieces],
  )

  /** DPI minimi della grafica sui pezzi che la usano; null se vettoriale o senza cartamodello. */
  const allOverDpi = useCallback((asset: AssetRef, zone: PrintZone | 'main', overrides = allOver?.overrides): number | null => {
    if (asset.isVector || !asset.width || !asset.height) return null
    const target = zone === 'main' ? allOverPieces.filter((p) => !overrides?.[p.zone]) : allOverPieces.filter((p) => p.zone === zone)
    if (!target.length) return null
    return Math.min(...target.map((p) => { const c = pieceCm(p); return effectiveDpi(asset.width, asset.height, c.w, c.h, 1, 'cover') }))
  }, [allOverPieces, allOver])

  const allOverQuality = useCallback((asset: AssetRef, zone: PrintZone | 'main'): { quality: AssetRef['quality']; dpi: number | null } => {
    if (asset.isVector) return { quality: 'vector', dpi: null }
    const dpi = allOverDpi(asset, zone)
    if (dpi == null) return { quality: 'ok', dpi: null }
    return { quality: dpi >= opts.quality.min_dpi ? 'ok' : dpi >= opts.quality.warn_dpi ? 'warn' : 'poor', dpi }
  }, [allOverDpi, opts.quality])

  /** Imposta o rimuove (asset null) la grafica del capo o la sostituzione di un pezzo, per il componente visualizzato. */
  const setAllOverAsset = useCallback((zone: PrintZone | 'main', asset: AssetRef | null) => {
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
      if (asset) overrides[zone] = asset
      else delete overrides[zone]
      list[i] = { ...list[i], overrides }
      return { ...c, allOver: list }
    })
    if (zone === 'front' || zone === 'back') setView(zone)
  }, [elementKit])

  /** Carica una grafica all-over (per il capo o per un pezzo) con controllo del file. */
  const uploadAllOver = useCallback(async (zone: PrintZone | 'main', file: File) => {
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

  const pickAllOverLibrary = useCallback((zone: PrintZone | 'main', a: CustomizationAsset) => {
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
  const price = useMemo(() => computePrice(product, config, qty), [product, config, qty])

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
          out.push({ section: 'allover', message: `${label}${zone === 'main' ? '' : `, ${ZONE_LABEL[zone as PrintZone].toLowerCase()}`}: conferma di aver preso visione della qualità della grafica.` })
        }
      }
    }
    for (const [i, e] of (config.elements ?? []).entries()) {
      const label = `${e.kind === 'logo' ? 'Logo' : 'Sponsor'} ${i + 1} (${ZONE_LABEL[e.zone].toLowerCase()})`
      const piece = zonePiece(opts.zones ?? [], e.zone, e.kitItemId ?? null)
      if (piece && placementIssue(e, piece, 0) === 'outside') out.push({ section: 'elements', message: `${label}: esce dal pezzo, spostalo o riducilo.` })
      const q = elementQuality(e)
      if ((q === 'warn' || q === 'poor') && !e.asset.acknowledgedLowQuality) out.push({ section: 'elements', message: `${label}: conferma di aver preso visione della qualità della grafica.` })
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
    const common = { shape: mainShape, baseColor, secondaryColor, layers, textStyle: config.textStyle!, guides: false }
    const f = document.createElement('canvas')
    const b = document.createElement('canvas')
    const mainKit = product.product_type === 'kit' ? firstKitItem : null
    drawPanel(f, { ...common, side: 'front', allOver: allOverImage(mainKit, 'front'), elements: silhouetteElements('front', mainShape, mainKit) }, 1024)
    drawPanel(b, { ...common, side: 'back', allOver: allOverImage(mainKit, 'back'), elements: silhouetteElements('back', mainShape, mainKit) }, 1024)
    const out: Partial<Record<'front' | 'back' | 'sleeveLeft' | 'sleeveRight', Blob>> = {}
    const [front, back] = await Promise.all([canvasToBlob(f), canvasToBlob(b)])
    if (front) out.front = front
    if (back) out.back = back
    // maniche: solo se hanno loghi, sponsor o grafica all-over (pezzo reale con colore di fondo)
    for (const [zone, key] of [['sleeve_left', 'sleeveLeft'], ['sleeve_right', 'sleeveRight']] as const) {
      const piece = zonePiece(zones, zone, mainKit)
      const els = elements.filter((e) => e.zone === zone && (e.kitItemId ?? null) === mainKit)
      const fill = allOverImage(mainKit, zone)
      if (!piece || (!els.length && !fill)) continue
      const blob = await canvasToBlob(drawSleevePreview(piece, els, elementImages, baseColor, fill))
      if (blob) out[key] = blob
    }
    return out
  }, [buildLayers, product, firstKitItem, baseColor, secondaryColor, config.textStyle, silhouetteElements, zones, elements, elementImages, allOverImage])

  return {
    product, config, setConfig, patch, setArea, toggleOption, uploadGraphic, pickLibraryAsset, setRoster, setTextStyle,
    roster, quantity, setQuantity, qty, price, issues, qualityIssues,
    kitItem, activeKitItem, setActiveKitItem, shape, areas, view, setView, previewRow, setPreviewRow,
    highlightArea, setHighlightArea, uploading, frontCanvas, backCanvas, version, guides, setGuides,
    baseColor, secondaryColor, renderPreviews,
    zones, freeEnabled, freeZones, freeMax, elements, elementKit, selectedElement, setSelectedElement,
    sleeveCanvases: {
      left: sleeveInfo(zonePiece(zones, 'sleeve_left', elementKit), sleeveLeftCanvas),
      right: sleeveInfo(zonePiece(zones, 'sleeve_right', elementKit), sleeveRightCanvas),
    },
    addElement, updateElement, removeElement, elementQuality, elementUploading, elementHeightCm,
    allOverEnabled, allOverKitCount, allOver, allOverZones, allOverPieces, allOverUploading, allOverQuality,
    setAllOverAsset, uploadAllOver, pickAllOverLibrary,
  }
}

export type ConfiguratorApi = ReturnType<typeof useConfigurator>
