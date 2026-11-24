// File di produzione: PDF in scala 1:1 con i pezzi disposti sulla larghezza del rotolo.
// Ogni pezzo: colore di fondo e grafiche ritagliati sul contorno con abbondanza, linea di
// taglio vettoriale sul colore spot "CutContour" (per stampa e taglio), etichetta sotto il pezzo
// (fuori dal tessuto utile). Le immagini restano alla risoluzione originale; SVG e WebP vengono
// convertiti in PNG, nomi e numeri sono resi a 300 dpi con lo stesso carattere dell'anteprima.
// Funziona nel browser dell'admin (usa canvas per le conversioni).

import {
  PDFDocument, PDFImage, PDFName, PDFNumber, PDFOperator, PDFOperatorNames, PDFPage, StandardFonts, rgb,
  closePath, clip, concatTransformationMatrix, endPath, fill, lineTo, moveTo, popGraphicsState, pushGraphicsState,
  setFillingRgbColor, setLineWidth, stroke, type PDFFont,
} from 'pdf-lib'
import type { AssetRef, TextStyle } from '@/types/config'
import { bounds, type Vec } from '@/lib/patterns/geometry'
import { PIECE_LABEL } from '@/lib/patterns/geometry'
import { drawFittedText, ensureFonts } from '@/features/configurator/garment/panel'
import { layoutPieces } from './layout'
import type { PieceJob } from './plan'

export interface ProductionSettings {
  /** Larghezza utile del rotolo (mm). */
  rollWidthMm: number
  /** Abbondanza oltre la linea di taglio (mm). */
  bleedMm: number
  /** Distanza minima tra i pezzi (mm). */
  gapMm: number
  /** Lunghezza massima di una pagina (mm). */
  maxPageMm: number
  /** Specchia le pagine per la stampa su carta transfer. */
  mirror: boolean
}

export interface PdfMeta {
  orderRef: string
  productName: string
  colorName: string | null
  baseColor: string
  secondaryColor: string | null
  notes: string | null
  roster: { name?: string; number?: string; size?: string; sizes?: Record<string, string>; quantity: number }[]
  warnings: string[]
}

export interface PdfResult { bytes: Uint8Array; pages: number; lengthMm: number; pieces: number; tooWide: string[] }

const PT = 72 / 25.4 // punti per mm
/** I caratteri standard del PDF coprono Latin-1: gli altri vengono sostituiti (es. nomi con caratteri speciali). */
const safe = (t: string) => t.replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^ -~ -ÿ]/g, '?')
const LABEL_BAND = 8 // mm sotto ogni pezzo per l'etichetta
const TEXT_DPI = 300

const hexRgb = (hex: string) => {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] as const
}

function pathOps(pts: Vec[]) {
  return [moveTo(pts[0][0], pts[0][1]), ...pts.slice(1).map(([x, y]) => lineTo(x, y)), closePath()]
}

/** Spazio colore spot "CutContour" (rimappato in magenta per la visualizzazione), registrato sulla pagina. */
function addCutContour(doc: PDFDocument, page: PDFPage) {
  const fn = doc.context.obj({ FunctionType: 2, Domain: [0, 1], C0: [0, 0, 0, 0], C1: [0, 1, 0, 0], N: 1 })
  const cs = doc.context.register(doc.context.obj([PDFName.of('Separation'), PDFName.of('CutContour'), PDFName.of('DeviceCMYK'), fn]))
  const res = page.node.Resources()!
  res.set(PDFName.of('ColorSpace'), doc.context.obj({ CSCut: cs }))
}

async function canvasPng(c: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
  if (!blob) throw new Error('Conversione immagine non riuscita.')
  return new Uint8Array(await blob.arrayBuffer())
}

async function rasterize(bytes: Uint8Array, mime: string, longSide: number): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }))
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    const w0 = img.naturalWidth || 1000, h0 = img.naturalHeight || 1000
    const k = mime === 'image/svg+xml' ? longSide / Math.max(w0, h0) : 1
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(w0 * k))
    c.height = Math.max(1, Math.round(h0 * k))
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return await canvasPng(c)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function buildProductionPdf(
  jobs: PieceJob[],
  settings: ProductionSettings,
  meta: PdfMeta,
  textStyle: TextStyle,
  loadAsset: (a: AssetRef) => Promise<Uint8Array>,
): Promise<PdfResult> {
  await ensureFonts()
  const doc = await PDFDocument.create()
  doc.setTitle(`${meta.orderRef} – file di produzione`)
  doc.setProducer('New Major')
  doc.setCreator('New Major – generatore file di produzione')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  // immagini incorporate una sola volta e riusate su tutti i pezzi
  const images = new Map<string, Promise<PDFImage>>()
  const embedAsset = (a: AssetRef, longestMm: number) => {
    const key = `${a.bucket}/${a.path}`
    let p = images.get(key)
    if (!p) {
      p = (async () => {
        const bytes = await loadAsset(a)
        if (a.mime === 'image/png') return doc.embedPng(bytes)
        if (a.mime === 'image/jpeg' || a.mime === 'image/jpg') return doc.embedJpg(bytes)
        const px = Math.min(8000, Math.max(1200, Math.round((longestMm / 25.4) * TEXT_DPI)))
        return doc.embedPng(await rasterize(bytes, a.mime, px))
      })()
      images.set(key, p)
    }
    return p
  }
  const texts = new Map<string, Promise<PDFImage>>()
  const embedText = (text: string, kind: 'text' | 'number', wMm: number, hMm: number) => {
    const key = `${kind}|${text}|${wMm}|${hMm}`
    let p = texts.get(key)
    if (!p) {
      p = (async () => {
        const c = document.createElement('canvas')
        c.width = Math.max(1, Math.round((wMm / 25.4) * TEXT_DPI))
        c.height = Math.max(1, Math.round((hMm / 25.4) * TEXT_DPI))
        drawFittedText(c.getContext('2d')!, text, 0, 0, c.width, c.height, textStyle, kind)
        return doc.embedPng(await canvasPng(c))
      })()
      texts.set(key, p)
    }
    return p
  }

  // disposizione sul rotolo
  const boxes = new Map(jobs.map((j) => [j.id, bounds(j.bleed)]))
  const layout = layoutPieces(
    jobs.map((j) => ({ id: j.id, w: boxes.get(j.id)!.width, h: boxes.get(j.id)!.height + LABEL_BAND })),
    settings.rollWidthMm, settings.gapMm, settings.maxPageMm,
  )
  const lengthMm = layout.pages.reduce((s, p) => s + p.length, 0)

  summaryPage(doc, font, bold, meta, settings, jobs, layout.pages.length, lengthMm, layout.tooWide.length)

  const byId = new Map(jobs.map((j) => [j.id, j]))
  for (let pi = 0; pi < layout.pages.length; pi++) {
    const lenMm = Math.max(layout.pages[pi].length, 50)
    const page = doc.addPage([settings.rollWidthMm * PT, lenMm * PT])
    addCutContour(doc, page)
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(PT, 0, 0, PT, 0, 0)) // da qui in poi: millimetri
    if (settings.mirror) page.pushOperators(concatTransformationMatrix(-1, 0, 0, 1, settings.rollWidthMm, 0))

    for (const pl of layout.placed.filter((p) => p.page === pi)) {
      const job = byId.get(pl.id)!
      const b = boxes.get(job.id)!
      const tx = pl.x - b.minX, ty = lenMm - pl.y - b.maxY
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(1, 0, 0, 1, tx, ty))

      // fondo e grafiche ritagliati sul contorno con abbondanza
      page.pushOperators(pushGraphicsState(), ...pathOps(job.bleed), clip(), endPath())
      const [r, g, bl] = hexRgb(job.fill)
      page.pushOperators(setFillingRgbColor(r, g, bl), ...pathOps(job.bleed), fill())
      if (job.allOver) {
        const img = await embedAsset(job.allOver, Math.max(b.width, b.height))
        const s = Math.max(b.width / img.width, b.height / img.height)
        page.drawImage(img, { x: b.minX + (b.width - img.width * s) / 2, y: b.minY + (b.height - img.height * s) / 2, width: img.width * s, height: img.height * s })
      }
      for (const p of job.placements) {
        const img = p.kind === 'text' ? await embedText(p.text!, p.textKind!, p.w, p.h) : await embedAsset(p.asset!, Math.max(p.w, p.h))
        const s = Math.min(p.w / img.width, p.h / img.height)
        const dw = img.width * s, dh = img.height * s
        const a = (-p.rotation * Math.PI) / 180
        page.pushOperators(pushGraphicsState(), concatTransformationMatrix(Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), p.center[0], p.center[1]))
        page.drawImage(img, { x: -dw / 2, y: -dh / 2, width: dw, height: dh })
        page.pushOperators(popGraphicsState())
      }
      page.pushOperators(popGraphicsState())

      // linea di taglio (spot CutContour, 0,25 pt)
      page.pushOperators(
        PDFOperator.of(PDFOperatorNames.StrokingColorspace, [PDFName.of('CSCut')]),
        PDFOperator.of(PDFOperatorNames.StrokingColorN, [PDFNumber.of(1)]),
        setLineWidth(0.25 / PT),
        ...pathOps(job.cut), stroke(),
      )

      // etichetta sotto il pezzo, sul tessuto di scarto
      const label = [
        meta.orderRef,
        job.componentLabel !== meta.productName ? job.componentLabel : null,
        `${PIECE_LABEL[job.piece]} (${job.pieceName})`,
        `taglia ${job.size}`,
        job.playerName || job.playerNumber ? [job.playerName, job.playerNumber && `n. ${job.playerNumber}`].filter(Boolean).join(' ') : `capo ${job.rosterIndex + 1}`,
        job.copies > 1 ? `copia ${job.copy}/${job.copies}${job.mirrored ? ' specchiata' : ''}` : null,
      ].filter(Boolean).join(' · ')
      page.drawText(safe(label), { x: b.minX, y: b.minY - 5, size: 2.6, font, color: rgb(0.25, 0.25, 0.28), maxWidth: Math.max(b.width, 60) })
      page.pushOperators(popGraphicsState())
    }
    page.pushOperators(popGraphicsState())
  }

  const bytes = await doc.save()
  return { bytes, pages: layout.pages.length, lengthMm, pieces: layout.placed.length, tooWide: layout.tooWide }
}

function summaryPage(
  doc: PDFDocument, font: PDFFont, bold: PDFFont, meta: PdfMeta, s: ProductionSettings, jobs: PieceJob[],
  pages: number, lengthMm: number, tooWide: number,
) {
  const page = doc.addPage([210 * PT, 297 * PT])
  let y = 297 * PT - 50
  const line = (t: string, size = 10, f = font, gap = 15) => { page.drawText(safe(t), { x: 42, y, size, font: f, maxWidth: 210 * PT - 84 }); y -= gap }
  line(`File di produzione · ${meta.orderRef}`, 16, bold, 26)
  line(`Prodotto: ${meta.productName}`)
  line(`Colore: ${meta.colorName ?? '—'} (${meta.baseColor}${meta.secondaryColor ? `, profili ${meta.secondaryColor}` : ''})`)
  line(`Pezzi da stampare: ${jobs.length} · rotoli: ${pages} · lunghezza stimata: ${(lengthMm / 1000).toFixed(2).replace('.', ',')} m`)
  line(`Rotolo ${s.rollWidthMm / 10} cm · abbondanza ${s.bleedMm} mm · distanza tra i pezzi ${s.gapMm} mm${s.mirror ? ' · pagine specchiate per carta transfer' : ''}`)
  line('Stampa al 100% (scala reale). Linea di taglio sul colore spot "CutContour". Etichette sul tessuto di scarto, sotto ogni pezzo.', 9, font, 24)
  if (meta.notes) { line('Indicazioni del cliente:', 10, bold); line(meta.notes, 9, font, 22) }
  if (tooWide) line(`ATTENZIONE: ${tooWide} pezzi più larghi del rotolo non sono stati disposti.`, 10, bold, 20)
  for (const w of meta.warnings) line(`Attenzione: ${w}`, 9, font, 13)
  y -= 8
  line('Roster', 12, bold, 18)
  line('#     Nome                                   Numero     Taglia            Quantità', 9, bold, 13)
  meta.roster.forEach((r, i) => {
    if (y < 50) return
    const size = r.size ?? Object.values(r.sizes ?? {}).join(' / ')
    line(`${String(i + 1).padEnd(5)} ${(r.name || '—').slice(0, 34).padEnd(38)} ${(r.number || '—').padEnd(10)} ${(size || '—').padEnd(17)} ${r.quantity}`, 9, font, 12)
  })
}
