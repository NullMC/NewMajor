// File di produzione: PDF con
// 1. riepilogo (ordine, roster, aree per tecnica con misure e prezzo, avvisi);
// 2. pezzi del cartamodello in scala 1:1 disposti sulla larghezza del rotolo (sublimazione):
//    fondo o colore della sezione, grafica all-over, fasce e aree in sublimazione ritagliati sul
//    contorno con abbondanza, linea di taglio vettoriale sul colore spot "CutContour", etichetta
//    sotto il pezzo (fuori dal tessuto utile);
// 3. foglio DTF: i transfer in scala 1:1, una copia per capo, con etichetta;
// 4. schede di posizionamento (A4) per zona: disegno del pezzo con le aree numerate e tabella con
//    tecnica, misure e posizione in cm dal riferimento (per serigrafia, ricamo e transfer).
// Le immagini restano alla risoluzione originale; SVG e WebP vengono convertiti in PNG, i testi
// sono resi a 300 dpi con lo stesso carattere dell'anteprima. Funziona nel browser dell'admin.

import {
  PDFDocument, PDFImage, PDFName, PDFNumber, PDFOperator, PDFOperatorNames, PDFPage, StandardFonts, rgb,
  closePath, clip, concatTransformationMatrix, endPath, fill, lineTo, moveTo, popGraphicsState, pushGraphicsState,
  setFillingRgbColor, setLineWidth, setStrokingRgbColor, stroke, type PDFFont,
} from 'pdf-lib'
import type { AssetRef, TextStyle } from '@/types/config'
import { bounds, type Vec } from '@/lib/patterns/geometry'
import { PIECE_LABEL } from '@/lib/patterns/geometry'
import { TECHNIQUE_LABEL } from '@/lib/printing'
import { drawFittedText, ensureFonts } from '@/features/configurator/garment/panel'
import { layoutPieces } from './layout'
import type { PieceJob, SpecSheet, TransferItem } from './plan'

export interface ProductionSettings {
  /** Larghezza utile del rotolo (mm). */
  rollWidthMm: number
  /** Abbondanza oltre la linea di taglio (mm). */
  bleedMm: number
  /** Distanza minima tra i pezzi (mm). */
  gapMm: number
  /** Lunghezza massima di una pagina (mm). */
  maxPageMm: number
  /** Specchia le pagine dei pezzi per la stampa su carta transfer. */
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

export interface PdfPlan { jobs: PieceJob[]; transfers: TransferItem[]; specs: SpecSheet[] }

export interface PdfResult {
  bytes: Uint8Array
  pages: number
  lengthMm: number
  pieces: number
  transfers: number
  dtfLengthMm: number
  specSheets: number
  tooWide: string[]
}

const PT = 72 / 25.4 // punti per mm
/** I caratteri standard del PDF coprono Latin-1: gli altri vengono sostituiti (es. nomi con caratteri speciali). */
const safe = (t: string) => t.replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/×/g, 'x').replace(/[^ -~ -ÿ]/g, '?')
const LABEL_BAND = 8 // mm sotto ogni pezzo per l'etichetta
const TEXT_DPI = 300
const cm = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')
const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} EUR`

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
  plan: PdfPlan,
  settings: ProductionSettings,
  meta: PdfMeta,
  textStyle: TextStyle,
  loadAsset: (a: AssetRef) => Promise<Uint8Array>,
): Promise<PdfResult> {
  const { jobs, transfers, specs } = plan
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
  const embedText = (text: string, kind: 'text' | 'number', wMm: number, hMm: number, style: TextStyle) => {
    const key = `${kind}|${text}|${wMm}|${hMm}|${style.font}|${style.color}|${style.outline ?? ''}`
    let p = texts.get(key)
    if (!p) {
      p = (async () => {
        const c = document.createElement('canvas')
        c.width = Math.max(1, Math.round((wMm / 25.4) * TEXT_DPI))
        c.height = Math.max(1, Math.round((hMm / 25.4) * TEXT_DPI))
        drawFittedText(c.getContext('2d')!, text, 0, 0, c.width, c.height, style, kind)
        return doc.embedPng(await canvasPng(c))
      })()
      texts.set(key, p)
    }
    return p
  }
  /** Immagine contenuta nel riquadro (w × h) centrato in (cx, cy), ruotata in senso orario. */
  const drawContained = (page: PDFPage, img: PDFImage, cx: number, cy: number, w: number, h: number, rotation: number) => {
    const s = Math.min(w / img.width, h / img.height)
    const dw = img.width * s, dh = img.height * s
    const a = (-rotation * Math.PI) / 180
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), cx, cy))
    page.drawImage(img, { x: -dw / 2, y: -dh / 2, width: dw, height: dh })
    page.pushOperators(popGraphicsState())
  }
  /** Immagine che copre il rettangolo (ritagliata dal clip corrente). */
  const drawCover = (page: PDFPage, img: PDFImage, x: number, y: number, w: number, h: number) => {
    const s = Math.max(w / img.width, h / img.height)
    page.drawImage(img, { x: x + (w - img.width * s) / 2, y: y + (h - img.height * s) / 2, width: img.width * s, height: img.height * s })
  }

  // disposizione dei pezzi sul rotolo
  const boxes = new Map(jobs.map((j) => [j.id, bounds(j.bleed)]))
  const layout = layoutPieces(
    jobs.map((j) => ({ id: j.id, w: boxes.get(j.id)!.width, h: boxes.get(j.id)!.height + LABEL_BAND })),
    settings.rollWidthMm, settings.gapMm, settings.maxPageMm,
  )
  const lengthMm = jobs.length ? layout.pages.reduce((s, p) => s + p.length, 0) : 0
  const piecePages = jobs.length ? layout.pages.length : 0

  // disposizione dei transfer DTF (una copia per capo)
  const dtfCopies = transfers.flatMap((t) => Array.from({ length: t.copies }, (_, i) => ({ t, id: `${t.id}#${i}` })))
  const dtfLayout = layoutPieces(dtfCopies.map((c) => ({ id: c.id, w: c.t.w, h: c.t.h + LABEL_BAND })), settings.rollWidthMm, settings.gapMm, settings.maxPageMm)
  const dtfLengthMm = dtfCopies.length ? dtfLayout.pages.reduce((s, p) => s + p.length, 0) : 0

  summaryPage(doc, font, bold, meta, settings, plan, piecePages, lengthMm, layout.tooWide.length, dtfLengthMm)

  const byId = new Map(jobs.map((j) => [j.id, j]))
  for (let pi = 0; pi < piecePages; pi++) {
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
      if (job.allOver) drawCover(page, await embedAsset(job.allOver, Math.max(b.width, b.height)), b.minX, b.minY, b.width, b.height)
      if (job.band) {
        // fascia: dal fondo del pezzo (abbondanza compresa) fino all'altezza indicata sopra il taglio
        const cutMin = bounds(job.cut).minY
        const y0 = b.minY, h = cutMin - b.minY + job.band.heightMm
        if (job.band.color) {
          const [br, bg, bb] = hexRgb(job.band.color)
          page.pushOperators(setFillingRgbColor(br, bg, bb), moveTo(b.minX, y0), lineTo(b.maxX, y0), lineTo(b.maxX, y0 + h), lineTo(b.minX, y0 + h), closePath(), fill())
        } else if (job.band.asset) {
          page.pushOperators(pushGraphicsState(), moveTo(b.minX, y0), lineTo(b.maxX, y0), lineTo(b.maxX, y0 + h), lineTo(b.minX, y0 + h), closePath(), clip(), endPath())
          drawCover(page, await embedAsset(job.band.asset, b.width), b.minX, y0, b.width, h)
          page.pushOperators(popGraphicsState())
        }
      }
      for (const p of job.placements) {
        const img = p.kind === 'text' ? await embedText(p.text!, p.textKind!, p.w, p.h, p.textStyle ?? textStyle) : await embedAsset(p.asset!, Math.max(p.w, p.h))
        drawContained(page, img, p.center[0], p.center[1], p.w, p.h, p.rotation)
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
        `taglia ${job.size}${job.patternSize !== job.size ? ` (dima ${job.patternSize})` : ''}`,
        job.playerName || job.playerNumber ? [job.playerName, job.playerNumber && `n. ${job.playerNumber}`].filter(Boolean).join(' ') : `capo ${job.rosterIndex + 1}`,
        job.copies > 1 ? `copia ${job.copy}/${job.copies}${job.mirrored ? ' specchiata' : ''}` : null,
      ].filter(Boolean).join(' · ')
      page.drawText(safe(label), { x: b.minX, y: b.minY - 5, size: 2.6, font, color: rgb(0.25, 0.25, 0.28), maxWidth: Math.max(b.width, 60) })
      page.pushOperators(popGraphicsState())
    }
    page.pushOperators(popGraphicsState())
  }

  // foglio DTF: transfer 1:1, non specchiati, con etichetta sotto
  const dtfById = new Map(dtfCopies.map((c) => [c.id, c.t]))
  const dtfPages = dtfCopies.length ? dtfLayout.pages.length : 0
  for (let pi = 0; pi < dtfPages; pi++) {
    const lenMm = Math.max(dtfLayout.pages[pi].length, 50)
    const page = doc.addPage([settings.rollWidthMm * PT, lenMm * PT])
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(PT, 0, 0, PT, 0, 0))
    for (const pl of dtfLayout.placed.filter((p) => p.page === pi)) {
      const t = dtfById.get(pl.id)!
      const cx = pl.x + t.w / 2, cy = lenMm - pl.y - t.h / 2
      const img = t.kind === 'text' ? await embedText(t.text ?? '', 'text', t.w, t.h, t.textStyle ?? textStyle) : await embedAsset(t.asset!, Math.max(t.w, t.h))
      drawContained(page, img, cx, cy, t.w, t.h, 0)
      page.drawText(safe(`${meta.orderRef} · ${t.componentLabel !== meta.productName ? `${t.componentLabel} · ` : ''}${t.label} · ${cm(t.w / 10)} x ${cm(t.h / 10)} cm`), {
        x: pl.x, y: lenMm - pl.y - t.h - 5, size: 2.6, font, color: rgb(0.25, 0.25, 0.28), maxWidth: Math.max(t.w, 60),
      })
    }
    page.pushOperators(popGraphicsState())
  }

  for (const sheet of specs) specPage(doc, font, bold, meta, sheet)

  const bytes = await doc.save()
  return {
    bytes, pages: piecePages, lengthMm, pieces: jobs.length ? layout.placed.length : 0,
    transfers: dtfCopies.length ? dtfLayout.placed.length : 0, dtfLengthMm, specSheets: specs.length,
    tooWide: [...(jobs.length ? layout.tooWide : []), ...(dtfCopies.length ? dtfLayout.tooWide : [])],
  }
}

function summaryPage(
  doc: PDFDocument, font: PDFFont, bold: PDFFont, meta: PdfMeta, s: ProductionSettings, plan: PdfPlan,
  pages: number, lengthMm: number, tooWide: number, dtfLengthMm: number,
) {
  const page = doc.addPage([210 * PT, 297 * PT])
  let y = 297 * PT - 50
  const line = (t: string, size = 10, f = font, gap = 15) => { if (y < 40) return; page.drawText(safe(t), { x: 42, y, size, font: f, maxWidth: 210 * PT - 84 }); y -= gap }
  const m = (mm: number) => (mm / 1000).toFixed(2).replace('.', ',')
  line(`File di produzione · ${meta.orderRef}`, 16, bold, 26)
  line(`Prodotto: ${meta.productName}`)
  line(`Colore: ${meta.colorName ?? '—'} (${meta.baseColor}${meta.secondaryColor ? `, profili ${meta.secondaryColor}` : ''})`)
  if (plan.jobs.length) {
    line(`Pezzi da sublimare: ${plan.jobs.length} · pagine: ${pages} · lunghezza stimata: ${m(lengthMm)} m`)
    line(`Rotolo ${s.rollWidthMm / 10} cm · abbondanza ${s.bleedMm} mm · distanza tra i pezzi ${s.gapMm} mm${s.mirror ? ' · pagine dei pezzi specchiate per carta transfer' : ''}`)
    line('Stampa al 100% (scala reale). Linea di taglio sul colore spot "CutContour". Etichette sul tessuto di scarto, sotto ogni pezzo.', 9, font, 20)
  }
  if (plan.transfers.length) {
    const copies = plan.transfers.reduce((a, t) => a + t.copies, 0)
    line(`Transfer DTF: ${plan.transfers.length} grafiche, ${copies} copie · foglio a parte in scala 1:1, non specchiato · circa ${m(dtfLengthMm)} m`, 10, font, 18)
  }
  if (plan.specs.length) line(`Schede di posizionamento: ${plan.specs.length} (una per zona, misure in cm dal riferimento del pezzo).`, 10, font, 18)
  if (meta.notes) { line('Indicazioni del cliente:', 10, bold); line(meta.notes, 9, font, 22) }
  if (tooWide) line(`ATTENZIONE: ${tooWide} elementi più larghi del rotolo non sono stati disposti.`, 10, bold, 20)
  for (const w of meta.warnings) line(`Attenzione: ${w}`, 9, font, 13)

  // aree di stampa per tecnica
  const items = plan.specs.flatMap((sh) => sh.items.map((it) => ({ sh, it })))
  if (items.length) {
    y -= 8
    line('Aree di stampa (per capo)', 12, bold, 18)
    const groups = new Map<string, typeof items>()
    for (const x of items) {
      const k = x.it.technique ? TECHNIQUE_LABEL[x.it.technique] : 'Stampa sul pezzo'
      groups.set(k, [...(groups.get(k) ?? []), x])
    }
    for (const [tech, list] of groups) {
      const tot = list.reduce((a, x) => a + (x.it.price ?? 0), 0)
      line(`${tech}: ${list.length} ${list.length === 1 ? 'area' : 'aree'}${list.some((x) => x.it.price != null) ? ` · ${eur(tot)} a capo` : ''}`, 10, bold, 14)
      for (const { sh, it } of list) {
        line(`   ${sh.componentLabel !== meta.productName ? `${sh.componentLabel} · ` : ''}${sh.zoneLabel} · ${it.label} · ${cm(it.widthCm)} x ${cm(it.heightCm)} cm${it.price != null ? ` · ${eur(it.price)}` : ''}`, 9, font, 12)
      }
    }
  }
  y -= 8
  line('Roster', 12, bold, 18)
  line('#     Nome                                   Numero     Taglia            Quantità', 9, bold, 13)
  meta.roster.forEach((r, i) => {
    const size = r.size ?? Object.values(r.sizes ?? {}).join(' / ')
    line(`${String(i + 1).padEnd(5)} ${(r.name || '—').slice(0, 34).padEnd(38)} ${(r.number || '—').padEnd(10)} ${(size || '—').padEnd(17)} ${r.quantity}`, 9, font, 12)
  })
}

/** Scheda A4 di una zona: disegno del pezzo con le aree numerate e tabella delle misure. */
function specPage(doc: PDFDocument, font: PDFFont, bold: PDFFont, meta: PdfMeta, sheet: SpecSheet) {
  const W = 210, H = 297
  const page = doc.addPage([W * PT, H * PT])
  const text = (t: string, x: number, yy: number, size: number, f = font, color = rgb(0.1, 0.1, 0.12)) => page.drawText(safe(t), { x: x * PT, y: yy * PT, size, font: f, color })
  text(`Scheda di posizionamento · ${meta.orderRef}`, 15, H - 18, 14, bold)
  text(`${sheet.componentLabel} · ${sheet.zoneLabel} · ${sheet.garments} ${sheet.garments === 1 ? 'capo' : 'capi'}`, 15, H - 26, 10)
  text(sheet.virtual
    ? 'Disegno indicativo sulla sagoma del capo (nessun cartamodello): fanno fede le misure in cm.'
    : `Disegno sul pezzo "${sheet.pieceName}", taglia ${sheet.size}. Le misure in cm valgono per tutte le taglie.`, 15, H - 32, 8, font, rgb(0.35, 0.35, 0.4))

  // disegno: pezzo scalato nel riquadro, y verso l'alto
  const box = { x: 15, y: 120, w: W - 30, h: H - 160 }
  const b = bounds(sheet.outline)
  const k = Math.min(box.w / b.width, box.h / b.height)
  const ox = box.x + (box.w - b.width * k) / 2 - b.minX * k
  const oy = box.y + (box.h - b.height * k) / 2 - b.minY * k
  const P = (v: Vec): Vec => [(ox + v[0] * k) * PT, (oy + v[1] * k) * PT]
  const poly = (pts: Vec[]) => pathOps(pts.map(P))
  page.pushOperators(setStrokingRgbColor(0.2, 0.2, 0.24), setLineWidth(0.8), ...poly(sheet.outline), stroke())
  // asse e riferimento
  const [ax, ay] = P(sheet.anchor)
  page.pushOperators(setStrokingRgbColor(0.75, 0.75, 0.78), setLineWidth(0.4), moveTo(ax, (oy + b.minY * k) * PT), lineTo(ax, (oy + b.maxY * k) * PT), stroke())
  page.drawCircle({ x: ax, y: ay, size: 2.2, color: rgb(0.78, 0.6, 0.2) })
  sheet.items.forEach((it, i) => {
    page.pushOperators(setStrokingRgbColor(0.85, 0.2, 0.3), setLineWidth(0.9), ...poly(it.corners), stroke())
    const c = it.corners.reduce((a, v) => [a[0] + v[0] / 4, a[1] + v[1] / 4] as Vec, [0, 0] as Vec)
    const [cx, cy] = P(c)
    page.drawCircle({ x: cx, y: cy, size: 5, color: rgb(0.85, 0.2, 0.3) })
    page.drawText(String(i + 1), { x: cx - (i + 1 >= 10 ? 4 : 2), y: cy - 3, size: 8, font: bold, color: rgb(1, 1, 1) })
  })

  // tabella
  let y = 110
  const cols = [15, 22, 80, 108, 132, 178]
  const head = ['#', 'Area', 'Tecnica', 'Misure (cm)', 'Posizione (cm)', 'Rotazione']
  head.forEach((h, i) => text(h, cols[i], y, 8, bold))
  y -= 6
  const isSleeve = sheet.zone === 'sleeve_left' || sheet.zone === 'sleeve_right'
  for (const [i, it] of sheet.items.entries()) {
    if (y < 18) break
    const xs = it.xCm === 0 ? 'centrata' : `${cm(Math.abs(it.xCm))} a ${it.xCm > 0 ? 'destra' : 'sinistra'}`
    const row = [
      String(i + 1), it.label.slice(0, 34), it.technique ? TECHNIQUE_LABEL[it.technique] : 'Sul pezzo',
      `${cm(it.widthCm)} x ${cm(it.heightCm)}`, `${xs}; ${cm(it.yCm)} sotto`, it.rotation ? `${it.rotation}°` : '—',
    ]
    row.forEach((v, j) => text(v, cols[j], y, 8))
    y -= 5.5
  }
  text(`Posizione: centro dell'area rispetto al riferimento (punto oro: ${isSleeve ? 'sommità della manica' : 'centro collo / centro vita'}), guardando il capo dall'esterno.`, 15, 12, 7, font, rgb(0.35, 0.35, 0.4))
}
