import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AssetRef, AreaConfig, Configuration, RosterEntry, TextStyle } from '@/types/config'
import { emptyConfiguration } from '@/types/config'
import type { CustomizationArea, CustomizationAsset, ModelShape, ProductDetail, QualitySettings } from '@/types/db'
import { computePrice, configQuantity } from '@/lib/pricing'
import { evaluateQuality, effectiveDpi, readImageInfo } from '@/lib/imageQuality'
import { uid } from '@/lib/slug'
import { PUBLIC_BUCKET } from '@/lib/storage'
import { assetDisplayUrl, storeGraphic } from '@/features/cart/assets'
import { canvasToBlob, drawPanel, ensureFonts, type PanelLayer } from './garment/panel'

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

export function useConfigurator(
  product: ProductDetail,
  opts: { initial?: Configuration | null; userId: string | null; quality: QualitySettings; initialQuantity?: number; initialVariantId?: string | null },
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
    .join('|')
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const next: Record<string, HTMLImageElement> = {}
      for (const [id, a] of Object.entries(config.areas)) {
        if (!a.enabled || !a.asset) continue
        try {
          const url = await assetDisplayUrl(a.asset)
          if (url) next[id] = await loadImage(url)
        } catch { /* immagine non disponibile */ }
      }
      if (!cancelled) setImages(next)
    })()
    return () => { cancelled = true }
  }, [assetKey])

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
        const common = { shape, baseColor, secondaryColor, layers, textStyle: config.textStyle!, guides, highlightId: highlightArea }
        drawPanel(frontCanvas, { ...common, side: 'front' })
        drawPanel(backCanvas, { ...common, side: 'back' })
        setVersion((v) => v + 1)
      })
    }, 16)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [areas, buildLayers, shape, baseColor, secondaryColor, config.textStyle, guides, highlightArea, frontCanvas, backCanvas])

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
  }, [product, config, roster, qty, qualityIssues])

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
    drawPanel(f, { ...common, side: 'front' }, 1024)
    drawPanel(b, { ...common, side: 'back' }, 1024)
    const [front, back] = await Promise.all([canvasToBlob(f), canvasToBlob(b)])
    return { front: front ?? undefined, back: back ?? undefined }
  }, [buildLayers, product, firstKitItem, baseColor, secondaryColor, config.textStyle])

  return {
    product, config, setConfig, patch, setArea, toggleOption, uploadGraphic, pickLibraryAsset, setRoster, setTextStyle,
    roster, quantity, setQuantity, qty, price, issues, qualityIssues,
    kitItem, activeKitItem, setActiveKitItem, shape, areas, view, setView, previewRow, setPreviewRow,
    highlightArea, setHighlightArea, uploading, frontCanvas, backCanvas, version, guides, setGuides,
    baseColor, secondaryColor, renderPreviews,
  }
}

export type ConfiguratorApi = ReturnType<typeof useConfigurator>
