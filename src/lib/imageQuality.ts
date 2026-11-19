// Controllo qualità delle grafiche caricate per la stampa.
//
// La risoluzione che conta per la stampa è quella EFFETTIVA: pixel dell'immagine
// diviso per la dimensione fisica di stampa dell'area (definita dall'admin in cm).
// I DPI scritti nei metadati del file sono solo informativi: un file "300 dpi"
// di 200 px stampato su 20 cm resta di bassa qualità.

import type { AssetQuality } from '@/types/config'
import type { QualitySettings } from '@/types/db'

export const ACCEPTED_GRAPHIC_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
export const DEFAULT_QUALITY: QualitySettings = { min_dpi: 300, warn_dpi: 150, max_file_mb: 50 }

export interface ImageInfo {
  width: number
  height: number
  mime: string
  sizeBytes: number
  isVector: boolean
  metadataDpi: number | null
  hasTransparency: boolean | null
}

export interface QualityReport {
  quality: AssetQuality
  effectiveDpi: number | null
  metadataDpi: number | null
  /** Pixel minimi consigliati per l'area alla risoluzione minima. */
  recommendedPx: { width: number; height: number }
  /** Dimensione massima stampabile a min_dpi, in cm. */
  maxPrintCm: { width: number; height: number } | null
  messages: { level: 'info' | 'warn' | 'error'; text: string }[]
  blocking: boolean
}

// --- Metadati DPI -----------------------------------------------------------------

function readPngDpi(view: DataView): number | null {
  // Firma PNG (8 byte) + chunk: length(4) type(4) data crc(4)
  let offset = 8
  while (offset + 8 < view.byteLength) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(
      view.getUint8(offset + 4), view.getUint8(offset + 5), view.getUint8(offset + 6), view.getUint8(offset + 7),
    )
    if (type === 'pHYs' && offset + 17 <= view.byteLength) {
      const ppuX = view.getUint32(offset + 8)
      const unit = view.getUint8(offset + 16)
      return unit === 1 ? Math.round(ppuX * 0.0254) : null
    }
    if (type === 'IDAT' || type === 'IEND') return null
    offset += 12 + length
  }
  return null
}

function readExifDpi(view: DataView, start: number): number | null {
  // start punta a "Exif\0\0"
  const tiff = start + 6
  if (tiff + 8 > view.byteLength) return null
  const little = view.getUint16(tiff) === 0x4949
  const u16 = (o: number) => view.getUint16(o, little)
  const u32 = (o: number) => view.getUint32(o, little)
  const ifd = tiff + u32(tiff + 4)
  if (ifd + 2 > view.byteLength) return null
  const entries = u16(ifd)
  let xres: number | null = null
  let unit = 2
  for (let i = 0; i < entries; i++) {
    const e = ifd + 2 + i * 12
    if (e + 12 > view.byteLength) break
    const tag = u16(e)
    if (tag === 0x011a) {
      const valOff = tiff + u32(e + 8)
      if (valOff + 8 <= view.byteLength) xres = u32(valOff) / (u32(valOff + 4) || 1)
    } else if (tag === 0x0128) {
      unit = u16(e + 8)
    }
  }
  if (!xres) return null
  return unit === 3 ? Math.round(xres * 2.54) : Math.round(xres)
}

function readJpegDpi(view: DataView): number | null {
  let offset = 2
  let jfif: number | null = null
  while (offset + 4 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break
    const marker = view.getUint8(offset + 1)
    const length = view.getUint16(offset + 2)
    if (marker === 0xe0 && offset + 18 <= view.byteLength) {
      // APP0 JFIF: units (1 = dpi, 2 = dpcm), Xdensity
      const units = view.getUint8(offset + 11)
      const xd = view.getUint16(offset + 12)
      if (units === 1) jfif = xd
      else if (units === 2) jfif = Math.round(xd * 2.54)
    } else if (marker === 0xe1) {
      const isExif = view.getUint32(offset + 4) === 0x45786966 // "Exif"
      if (isExif) {
        const exif = readExifDpi(view, offset + 4)
        if (exif) return exif
      }
    } else if (marker === 0xda) break
    offset += 2 + length
  }
  return jfif
}

function svgSize(text: string): { width: number; height: number } {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const svg = doc.documentElement
  const vb = svg.getAttribute('viewBox')?.split(/[\s,]+/).map(Number)
  const w = parseFloat(svg.getAttribute('width') ?? '') || (vb?.[2] ?? 0)
  const h = parseFloat(svg.getAttribute('height') ?? '') || (vb?.[3] ?? 0)
  return { width: Math.round(w) || 1000, height: Math.round(h) || 1000 }
}

async function detectTransparency(file: Blob): Promise<boolean | null> {
  try {
    const bmp = await createImageBitmap(file)
    const size = 96
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(bmp, 0, 0, size, size)
    bmp.close()
    const data = ctx.getImageData(0, 0, size, size).data
    for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true
    return false
  } catch {
    return null
  }
}

/** Legge dimensioni, tipo, DPI dichiarati e trasparenza di un file grafico. */
export async function readImageInfo(file: File): Promise<ImageInfo> {
  const mime = file.type || (file.name.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : '')
  if (mime === 'image/svg+xml') {
    const { width, height } = svgSize(await file.text())
    return { width, height, mime, sizeBytes: file.size, isVector: true, metadataDpi: null, hasTransparency: true }
  }
  const head = new DataView(await file.slice(0, Math.min(file.size, 256 * 1024)).arrayBuffer())
  let metadataDpi: number | null = null
  if (mime === 'image/png') metadataDpi = readPngDpi(head)
  else if (mime === 'image/jpeg') metadataDpi = readJpegDpi(head)

  const bitmap = await createImageBitmap(file)
  const { width, height } = bitmap
  bitmap.close()
  const hasTransparency = mime === 'image/jpeg' ? false : await detectTransparency(file)
  return { width, height, mime, sizeBytes: file.size, isVector: false, metadataDpi, hasTransparency }
}

/**
 * DPI effettivi di un'immagine in un'area di stampa.
 * "contain" (loghi/sponsor): l'immagine entra tutta nell'area; "cover" (all-over): la riempie.
 */
export function effectiveDpi(
  width: number, height: number, printWcm: number, printHcm: number, scale = 1, fit: 'contain' | 'cover' = 'contain',
): number {
  const s = Math.max(0.05, Math.min(1, scale))
  const rx = width / printWcm
  const ry = height / printHcm
  return Math.round((2.54 * (fit === 'cover' ? Math.min(rx, ry) : Math.max(rx, ry))) / s)
}

export function evaluateQuality(
  info: ImageInfo,
  area: { print_width_cm: number; print_height_cm: number; area_type?: string },
  settings: QualitySettings = DEFAULT_QUALITY,
  scale = 1,
): QualityReport {
  const messages: QualityReport['messages'] = []
  const minDpi = settings.min_dpi || 300
  const warnDpi = settings.warn_dpi || 150
  const recommendedPx = {
    width: Math.ceil((area.print_width_cm / 2.54) * minDpi * Math.min(1, scale)),
    height: Math.ceil((area.print_height_cm / 2.54) * minDpi * Math.min(1, scale)),
  }
  let blocking = false

  if (!ACCEPTED_GRAPHIC_TYPES.includes(info.mime)) {
    messages.push({ level: 'error', text: 'Formato non supportato. Usa PNG, JPG, WebP o SVG.' })
    blocking = true
  }
  if (info.sizeBytes > settings.max_file_mb * 1024 * 1024) {
    messages.push({ level: 'error', text: `Il file supera il limite di ${settings.max_file_mb} MB.` })
    blocking = true
  }

  if (info.isVector) {
    messages.push({ level: 'info', text: 'File vettoriale: qualità di stampa ottimale a qualsiasi dimensione.' })
    return { quality: 'vector', effectiveDpi: null, metadataDpi: null, recommendedPx, maxPrintCm: null, messages, blocking }
  }

  const fit = area.area_type === 'all_over' ? 'cover' : 'contain'
  const dpi = effectiveDpi(info.width, info.height, area.print_width_cm, area.print_height_cm, fit === 'cover' ? 1 : scale, fit)
  const maxPrintCm = {
    width: Math.round(((info.width / minDpi) * 2.54) * 10) / 10,
    height: Math.round(((info.height / minDpi) * 2.54) * 10) / 10,
  }

  let quality: AssetQuality = 'ok'
  if (dpi < warnDpi) {
    quality = 'poor'
    messages.push({
      level: 'error',
      text: `Risoluzione insufficiente: circa ${dpi} dpi alla dimensione di stampa (${area.print_width_cm}×${area.print_height_cm} cm). Il risultato sarà sgranato. Servono almeno ${recommendedPx.width}×${recommendedPx.height} px.`,
    })
  } else if (dpi < minDpi) {
    quality = 'warn'
    messages.push({
      level: 'warn',
      text: `Risoluzione inferiore ai ${minDpi} dpi consigliati (circa ${dpi} dpi). La stampa potrebbe risultare poco definita. Consigliati almeno ${recommendedPx.width}×${recommendedPx.height} px.`,
    })
  } else {
    messages.push({ level: 'info', text: `Risoluzione adeguata: circa ${dpi} dpi alla dimensione di stampa.` })
  }

  if (info.metadataDpi && info.metadataDpi >= minDpi && dpi < minDpi) {
    messages.push({
      level: 'info',
      text: `Il file dichiara ${info.metadataDpi} dpi, ma ciò che conta sono i pixel reali (${info.width}×${info.height}) rispetto alla dimensione di stampa.`,
    })
  }

  if (info.hasTransparency === false && area.area_type !== 'all_over') {
    messages.push({
      level: 'warn',
      text: 'L’immagine non ha sfondo trasparente: lo sfondo verrà stampato. Per loghi e sponsor è preferibile un PNG trasparente o un SVG.',
    })
  }

  return { quality, effectiveDpi: dpi, metadataDpi: info.metadataDpi, recommendedPx, maxPrintCm, messages, blocking }
}

export const QUALITY_LABEL: Record<AssetQuality, string> = {
  vector: 'Vettoriale',
  ok: 'Qualità adeguata',
  warn: 'Qualità limitata',
  poor: 'Qualità insufficiente',
}
