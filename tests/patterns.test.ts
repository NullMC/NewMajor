// Test di cartamodelli, posizionamento e produzione con dati DEMO (misure note, non per produzione).
import { parseDxf } from '../src/lib/patterns/dxf'
import { autoAnchor, bounds, legAnchors } from '../src/lib/patterns/geometry'
import { elementCenterMm, elementCornersMm, placementIssue } from '../src/lib/patterns/placement'
import { offsetOutline } from '../src/lib/production/offset'
import { layoutPieces } from '../src/lib/production/layout'
import { buildPlan, type ProductionPiece } from '../src/lib/production/plan'
import { boxesOverlap, distribute, elementBox, elementIssues, insideBox, nextSlot, quickSpot, usableBox, type Box } from '../src/lib/printing'
import { largestTorsoBox } from '../src/lib/patterns/placement'
import type { PlacedElement } from '../src/types/config'

let failures = 0
const ok = (m: string) => console.log('  ✓', m)
const fail = (m: string) => { failures++; console.log('  ✗', m) }
const near = (a: number, b: number, t = 0.05) => Math.abs(a - b) <= t

// DXF minimale in stile AAMA: due blocchi (davanti con scollo ad arco, manica), unità mm
const lw = (layer: string, pts: [number, number, number?][], closed = true) => [
  '0', 'LWPOLYLINE', '8', layer, '90', String(pts.length), '70', closed ? '1' : '0',
  ...pts.flatMap(([x, y, b]) => ['10', String(x), '20', String(y), ...(b ? ['42', String(b)] : [])]),
]
const text = (t: string) => ['0', 'TEXT', '8', '1', '10', '0', '20', '0', '40', '5', '1', t]
const block = (name: string, body: string[]) => ['0', 'BLOCK', '8', '0', '2', name, '70', '0', '10', '0', '20', '0', '3', name, ...body, '0', 'ENDBLK']
// davanti 500 x 700 mm, scollo: arco da (175,700) a (325,700) che scende di 75 mm al centro (bulge negativo = orario)
const front = lw('1', [[0, 0], [500, 0], [500, 700], [325, 700, -1], [175, 700]])
const sleeve = lw('1', [[0, 0], [380, 0], [330, 250], [190, 330], [50, 250]])
const dxf = [
  '0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC',
  '0', 'SECTION', '2', 'BLOCKS',
  ...block('P1', [...front, ...text('Piece Name: DEMO Davanti'), ...text('Size: M'), ...text('Quantity: 1')]),
  ...block('P2', [...sleeve, ...text('Piece Name: DEMO Manica'), ...text('Size: M'), ...text('Quantity: 2')]),
  '0', 'ENDSEC',
  '0', 'SECTION', '2', 'ENTITIES',
  '0', 'INSERT', '8', '0', '2', 'P1', '10', '0', '20', '0',
  '0', 'INSERT', '8', '0', '2', 'P2', '10', '600', '20', '0',
  '0', 'ENDSEC', '0', 'EOF',
].join('\n')

const res = parseDxf(dxf, null)
res.detectedUnit === 'mm' ? ok('unità letta da $INSUNITS (mm)') : fail(`unità ${res.detectedUnit}`)
res.pieces.length === 2 ? ok('2 pezzi importati dai blocchi') : fail(`pezzi: ${res.pieces.length} ${JSON.stringify(res.warnings)}`)
const f = res.pieces.find((p) => p.name === 'DEMO Davanti')!
const s = res.pieces.find((p) => p.name === 'DEMO Manica')!
f && f.kind === 'front' && f.size === 'M' ? ok('nome, tipo (davanti) e taglia dal testo del blocco') : fail(JSON.stringify(f && { k: f.kind, s: f.size }))
const fb = bounds(f.outline)
near(fb.width, 500) && near(fb.height, 700) ? ok(`davanti 500 x 700 mm esatti`) : fail(`davanti ${fb.width} x ${fb.height}`)
const a = autoAnchor(f.outline, 'front')
near(a[0], 250) && near(a[1], 625, 0.5) ? ok(`centro collo sull'asse, 75 mm sotto il bordo (${a[1]})`) : fail(`ancora ${a}`)
s && s.kind === 'sleeve_left' && s.quantity === 2 ? ok('manica riconosciuta, quantità 2') : fail(JSON.stringify(s && { k: s.kind, q: s.quantity }))
const sa = autoAnchor(s.outline, 'sleeve_left')
near(sa[0], 190) && near(sa[1], 330) ? ok('punto più alto della testa manica') : fail(`ancora manica ${sa}`)

// stesso file in pollici: le misure devono moltiplicarsi per 25,4
const inch = parseDxf(dxf.replace('$INSUNITS\n70\n4', '$INSUNITS\n70\n1'), null)
near(bounds(inch.pieces[0].outline).width, 500 * 25.4, 0.5) ? ok('conversione da pollici') : fail(String(bounds(inch.pieces[0].outline).width))

// Posizionamento in cm: stessa misura e stessa distanza dal collo su taglie diverse
{
  const anchorFn = autoAnchor
  const mk = (w: number, h: number, neck: number) => {
    const arc: [number, number][] = []
    for (let i = 0; i <= 16; i++) { const t = Math.PI * i / 16; arc.push([w / 2 + 75 * Math.cos(t), h - neck * Math.sin(t)]) }
    const outline = [[0, 0], [w, 0], [w, h], ...arc, [0, h]] as [number, number][]
    const [x, y] = anchorFn(outline, 'front')
    return { kitItemId: null, zone: 'front' as const, size: '', name: 'DEMO', outline, anchor: { x, y } }
  }
  const M = mk(500, 700, 75), XL = mk(560, 760, 80)
  const el = { id: 'e', kind: 'logo' as const, zone: 'front' as const, asset: { bucket: 'customer-uploads' as const, name: 'l', mime: 'image/png', width: 1000, height: 500, sizeBytes: 1, isVector: false, effectiveDpi: null, metadataDpi: null, quality: 'ok' as const }, xCm: 0, yCm: 10, widthCm: 10, rotation: 0 }
  const width = (c: [number, number][]) => Math.max(...c.map((p) => p[0])) - Math.min(...c.map((p) => p[0]))
  const cM = elementCornersMm(el, M), cXL = elementCornersMm(el, XL)
  near(width(cM), 100) && near(width(cXL), 100) ? ok('logo da 10 cm largo 100 mm su M e su XL') : fail(`${width(cM)} / ${width(cXL)}`)
  const dM = M.anchor.y! - elementCenterMm(el, M)[1], dXL = XL.anchor.y! - elementCenterMm(el, XL)[1]
  near(dM, 100) && near(dXL, 100) ? ok('centro a 10 cm sotto il collo su entrambe le taglie') : fail(`${dM} / ${dXL}`)
  near(elementCenterMm(el, M)[0], 250) && near(elementCenterMm(el, XL)[0], 280) ? ok('centrato sull\'asse di ogni taglia') : fail('asse')
  const rot = elementCornersMm({ ...el, rotation: 90 }, M)
  near(width(rot), 50) ? ok('rotazione di 90°: ingombro orizzontale = altezza (50 mm)') : fail(String(width(rot)))
  placementIssue(el, M) === null ? ok('logo ben dentro il pezzo: nessun avviso') : fail(String(placementIssue(el, M)))
  placementIssue({ ...el, xCm: 23 }, M) === 'outside' ? ok('logo oltre il fianco: segnalato come fuori dal pezzo') : fail(String(placementIssue({ ...el, xCm: 23 }, M)))
  placementIssue({ ...el, xCm: 19 }, M) === 'near_edge' ? ok('logo a meno di 1,5 cm dal bordo: avviso cucitura') : fail(String(placementIssue({ ...el, xCm: 19 }, M)))
}


// Produzione: abbondanza, disposizione sul rotolo, piano dei pezzi
{
  const sq: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100]]
  const b5 = bounds(offsetOutline(sq, 5))
  near(b5.width, 110, 0.1) && near(b5.minX, -5, 0.1) ? ok('abbondanza di 5 mm: il contorno cresce di 5 mm per lato') : fail(JSON.stringify(b5))

  const items = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, w: 300 + (i % 3) * 120, h: 400 + (i % 4) * 90 }))
  const lay = layoutPieces(items, 1600, 10, 5000)
  const overlap = lay.placed.some((a, i) => lay.placed.some((b, j) => j > i && a.page === b.page && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h))
  const outside = lay.placed.some((p) => p.x < 10 - 1e-6 || p.x + p.w > 1600 - 10 + 1e-6)
  lay.placed.length === 9 && !overlap && !outside ? ok(`9 pezzi sul rotolo da 160 cm: nessuna sovrapposizione, nessuno oltre i bordi (${Math.round(lay.pages[0].length)} mm)`) : fail(JSON.stringify({ overlap, outside, n: lay.placed.length }))
  const wide = layoutPieces([{ id: 'big', w: 1700, h: 100 }], 1600, 10, 5000)
  wide.tooWide.includes('big') ? ok('pezzo più largo del rotolo segnalato') : fail('pezzo largo non segnalato')
  const paged = layoutPieces(Array.from({ length: 12 }, (_, i) => ({ id: `q${i}`, w: 700, h: 800 })), 1600, 10, 2000)
  paged.pages.length > 1 && paged.placed.every((p) => p.y + p.h <= 2000) ? ok(`pagine di massimo 2 m: ${paged.pages.length} pagine`) : fail(JSON.stringify(paged.pages))

  // due taglie dello stesso davanti (DEMO) e una manica
  const body = (w: number, h: number, neck: number): [number, number][] => {
    const arc: [number, number][] = []
    for (let i = 0; i <= 16; i++) { const t = Math.PI * i / 16; arc.push([w / 2 + 80 * Math.cos(t), h - neck * Math.sin(t)]) }
    return [[0, 0], [w, 0], [w, h], ...arc, [0, h]]
  }
  const mkPiece = (size: string, piece: ProductionPiece['piece'], outline: [number, number][], name: string): ProductionPiece => {
    const [x, y] = autoAnchor(outline, piece)
    return { kitItemId: null, size, piece, name, quantity: 1, outline, anchor: { x, y }, mirror: false, grain_angle: 0 }
  }
  const sleeve: [number, number][] = [[40, 0], [340, 0], [380, 140], [190, 240], [0, 140]]
  const pieces = [
    mkPiece('M', 'front', body(500, 700, 80), 'Davanti'), mkPiece('XL', 'front', body(560, 760, 85), 'Davanti'),
    mkPiece('M', 'back', body(500, 720, 25), 'Dietro'), mkPiece('XL', 'back', body(560, 780, 25), 'Dietro'),
    mkPiece('M', 'sleeve_left', sleeve, 'Manica sx'), mkPiece('XL', 'sleeve_left', sleeve, 'Manica sx'),
  ]
  const asset = { bucket: 'customer-uploads' as const, path: 'u/l.png', name: 'l.png', mime: 'image/png', width: 1200, height: 600, sizeBytes: 1, isVector: false, effectiveDpi: null, metadataDpi: null, quality: 'ok' as const }
  const area = (id: string, area_type: string, side: string) => ({ id, product_id: 'p', kit_item_id: null, name: id, side, area_type, x: 30, y: 40, width: 40, height: 30, print_width_cm: 25, print_height_cm: 25, price_delta: 0, is_required: false, allow_library: true, allow_upload: true, sort_order: 0, is_active: true })
  const product = {
    id: 'p', name: 'DEMO', product_type: 'simple', model_shape: 'tshirt', sizes: ['M', 'XL'], kit_items: [],
    customization_areas: [area('Numero', 'number', 'back'), area('Nome', 'text', 'back')],
  } as never
  const config = {
    version: 1, optionValueIds: [], areas: { Numero: { enabled: true }, Nome: { enabled: true } },
    roster: [{ id: 'a', name: 'Rossi', number: '10', size: 'M', quantity: 1 }, { id: 'b', name: 'Bianchi', number: '7', size: 'XL', quantity: 1 }],
    elements: [
      { id: 'e1', kind: 'logo', zone: 'front', asset, xCm: 9, yCm: 12, widthCm: 8, rotation: 0 },
      { id: 'e2', kind: 'sponsor', zone: 'sleeve_left', asset, xCm: 0, yCm: 6, widthCm: 7, rotation: 0 },
    ],
  } as never
  const plan = buildPlan({ product, config, pieces, referenceSize: { main: 'M' }, baseColor: '#1E2A4A', secondaryColor: '#C2A063', textStyle: { color: '#fff', outline: null, font: 'block' }, bleedMm: 8 })
  plan.jobs.length === 6 ? ok('2 giocatori × 3 pezzi = 6 pezzi da stampare') : fail(`${plan.jobs.length} ${JSON.stringify(plan.warnings)}`)
  const fM = plan.jobs.find((j) => j.size === 'M' && j.piece === 'front')!, fXL = plan.jobs.find((j) => j.size === 'XL' && j.piece === 'front')!
  const lM = fM.placements.find((p) => p.label === 'Logo')!, lXL = fXL.placements.find((p) => p.label === 'Logo')!
  const dist = (j: typeof fM, pl: typeof lM) => { const a = pieces.find((p) => p.size === j.size && p.piece === 'front')!.anchor; return [pl.center[0] - a.x!, a.y! - pl.center[1]] }
  const [dxM, dyM] = dist(fM, lM), [dxXL, dyXL] = dist(fXL, lXL)
  near(lM.w, 80) && near(lXL.w, 80) && near(dxM, 90) && near(dxXL, 90) && near(dyM, 120) && near(dyXL, 120)
    ? ok('logo: 8 cm di larghezza, 9 cm a destra e 12 cm sotto il collo su M e XL') : fail(JSON.stringify({ lM: lM.w, dxM, dyM, dxXL, dyXL }))
  const bM = plan.jobs.find((j) => j.size === 'M' && j.piece === 'back')!, bXL = plan.jobs.find((j) => j.size === 'XL' && j.piece === 'back')!
  const nM = bM.placements.find((p) => p.textKind === 'number')!, nXL = bXL.placements.find((p) => p.textKind === 'number')!
  nM && nXL && nM.text === '10' && nXL.text === '7' && near(nM.w, 250) && bM.placements.some((p) => p.text === 'ROSSI') ? ok('nome e numero di ogni giocatore sul suo dietro, 25 cm come da area') : fail(JSON.stringify({ nM, nXL, w: plan.warnings }))
  const dyNum = (j: typeof bM, pl: typeof nM) => pieces.find((p) => p.size === j.size && p.piece === 'back')!.anchor.y! - pl.center[1]
  nM && nXL && near(dyNum(bM, nM), dyNum(bXL, nXL)) ? ok(`numero alla stessa distanza dal collo su M e XL (${Math.round(dyNum(bM, nM))} mm)`) : fail('numero')
  const sl = plan.jobs.find((j) => j.piece === 'sleeve_left')!
  sl.placements.length === 1 && sl.placements[0].label === 'Sponsor' ? ok('sponsor sulla manica sinistra') : fail(JSON.stringify(sl.placements))
  near(bounds(fM.bleed).width - bounds(fM.cut).width, 16, 0.2) ? ok('abbondanza di 8 mm intorno a ogni pezzo') : fail(String(bounds(fM.bleed).width - bounds(fM.cut).width))

  // grafica all-over del cliente: riempie ogni pezzo, la sostituzione vale solo sul suo pezzo
  const all = { ...asset, path: 'u/all.png' }, backArt = { ...asset, path: 'u/back.png' }
  const aoPlan = buildPlan({
    product, config: { ...(config as object), allOver: [{ asset: all, overrides: { back: backArt } }] } as never,
    pieces, referenceSize: { main: 'M' }, baseColor: '#1E2A4A', secondaryColor: null, textStyle: { color: '#fff', outline: null, font: 'block' }, bleedMm: 8,
  })
  const byPiece = (k: string) => aoPlan.jobs.filter((j) => j.piece === k).map((j) => j.allOver?.path)
  byPiece('front').every((p) => p === 'u/all.png') && byPiece('sleeve_left').every((p) => p === 'u/all.png') && byPiece('back').every((p) => p === 'u/back.png')
    ? ok('all-over: grafica del capo su davanti e maniche, sostituzione solo sul dietro') : fail(JSON.stringify({ f: byPiece('front'), b: byPiece('back'), s: byPiece('sleeve_left') }))
  aoPlan.jobs.find((j) => j.piece === 'front')!.placements.length === fM.placements.length
    ? ok('all-over: loghi, nomi e numeri restano sopra la grafica') : fail('placements cambiati')
}

// Aree per tecnica, transfer DTF, schede, dima di riferimento, fasce, colori per sezione, gambe
{
  const asset = { bucket: 'customer-uploads' as const, path: 'u/g.png', name: 'g.png', mime: 'image/png', width: 1000, height: 1000, sizeBytes: 1, isVector: false, effectiveDpi: null, metadataDpi: null, quality: 'ok' as const }
  const rect = (w: number, h: number): [number, number][] => [[0, 0], [w, 0], [w, h], [0, h]]
  const pc = (size: string, piece: ProductionPiece['piece'], outline: [number, number][], anchor: ProductionPiece['anchor']): ProductionPiece =>
    ({ kitItemId: null, size, piece, name: piece, quantity: 1, outline, anchor, mirror: false, grain_angle: 0 })
  const style = { color: '#fff', outline: null, font: 'block' as const }
  const techniques = [
    { code: 'dtf', name: 'Stampa DTF', min_price: 1.5, max_price: 5, all_over_only: false, is_active: true, sort_order: 20 },
    { code: 'screen', name: 'Serigrafia', min_price: 1.5, max_price: 5, all_over_only: false, is_active: true, sort_order: 10 },
  ] as never
  const zoneRow = { id: 'z', product_id: 'p', kit_item_id: null, zone: 'front', x_cm: -15, y_cm: 5, width_cm: 30, height_cm: 30, max_items: 3, allow_graphic: true, allow_text: true, techniques: ['dtf', 'screen', 'sublimation'], sort_order: 0 }
  const tee = {
    id: 'p', name: 'T', product_type: 'simple', model_shape: 'tshirt', sizes: ['M', 'L'], kit_items: [], customization_areas: [],
    print_zones: [zoneRow], band_enabled: true, band_height_cm: 3,
  } as never
  const teePieces = [pc('M', 'front', rect(500, 700), { x: 250, y: 620 }), pc('M', 'sleeve_left', rect(380, 240), { x: 190, y: 240 })]
  const cfg = {
    version: 1, optionValueIds: [], areas: {},
    roster: [{ id: 'a', size: 'M', quantity: 1 }, { id: 'b', size: 'L', quantity: 2 }],
    elements: [
      { id: 'd', kind: 'graphic', zone: 'front', asset, xCm: 0, yCm: 12, widthCm: 15, heightCm: 15, rotation: 0, technique: 'dtf' },
      { id: 's', kind: 'text', zone: 'front', text: 'Team', font: 'block', color: '#FF0000', xCm: 0, yCm: 28, widthCm: 20, heightCm: 5, rotation: 0, technique: 'sublimation' },
    ],
    bands: [{ kitItemId: null, mode: 'color', color: '#00FF00' }],
    allOver: [{ asset, colors: { sleeve_left: '#123456' } }],
  } as never
  const r = buildPlan({ product: tee, config: cfg, pieces: teePieces, referenceSize: { main: 'M' }, baseColor: '#FFFFFF', secondaryColor: null, textStyle: style, bleedMm: 5, techniques })
  const front = r.jobs.filter((j) => j.piece === 'front')
  front.length === 3 && front.every((j) => j.placements.length === 1 && j.placements[0].kind === 'text' && j.placements[0].text === 'TEAM' && j.placements[0].textStyle?.color === '#FF0000')
    ? ok('sublimazione sul pezzo (testo con il suo colore), DTF non stampato sul pezzo') : fail(JSON.stringify(front.map((j) => j.placements)))
  r.transfers.length === 1 && r.transfers[0].copies === 3 && near(r.transfers[0].w, 150) && near(r.transfers[0].h, 150)
    ? ok('transfer DTF 15 × 15 cm, una copia per capo (3)') : fail(JSON.stringify(r.transfers))
  const spec = r.specs.find((s) => s.zone === 'front')
  // 15×15 = 225 cm² su 900 cm² → 1,50 + 0,25 × 3,50 = 2,375 → 2,38
  spec && spec.items.length === 2 && spec.items[0].price === 2.38 && spec.items[0].technique === 'dtf' && spec.garments === 3 && !spec.virtual
    ? ok('scheda del davanti: 2 aree, prezzo DTF in proporzione all’area (2,38 €)') : fail(JSON.stringify(spec && { items: spec.items.map((i) => [i.technique, i.price]), g: spec.garments }))
  const lJobs = r.jobs.filter((j) => j.size === 'L')
  lJobs.length === 4 && lJobs.every((j) => j.patternSize === 'M') && r.warnings.some((w) => w.includes('taglia L senza dima, usata la dima M'))
    ? ok('taglia senza pezzi: usata la dima M, segnalato una volta') : fail(JSON.stringify({ n: lJobs.length, w: r.warnings }))
  const sl = r.jobs.find((j) => j.piece === 'sleeve_left')!, fr = r.jobs.find((j) => j.piece === 'front')!
  sl.band?.color === '#00FF00' && near(sl.band.heightMm, 30) && fr.band === null ? ok('fascia colorata di 3 cm sulle maniche, non sul davanti') : fail(JSON.stringify({ s: sl.band, f: fr.band }))
  sl.fill === '#123456' && sl.allOver === null && fr.allOver?.path === 'u/g.png' ? ok('colore della sezione sulla manica, grafica all-over sul davanti') : fail(JSON.stringify({ fill: sl.fill, a: sl.allOver, f: fr.allOver }))

  // senza cartamodello: schede e transfer DTF comunque, avviso solo se servono pezzi da sublimare
  const noPat = buildPlan({ product: tee, config: { ...(cfg as object), allOver: [], elements: [(cfg as { elements: unknown[] }).elements[0]] } as never, pieces: [], referenceSize: {}, baseColor: '#FFFFFF', secondaryColor: null, textStyle: style, bleedMm: 5, techniques })
  noPat.jobs.length === 0 && noPat.transfers.length === 1 && noPat.specs.length === 1 && noPat.specs[0].virtual && noPat.warnings.length === 0
    ? ok('senza cartamodello: transfer DTF e scheda sulla sagoma, nessun avviso') : fail(JSON.stringify({ j: noPat.jobs.length, t: noPat.transfers.length, s: noPat.specs.map((s) => s.virtual), w: noPat.warnings }))

  // pantaloncino: gambe con davanti e dietro uniti, centro davanti (basso) e centro dietro (alto) in vita
  const leg: [number, number][] = [[0, 0], [600, 0], [600, 560], [300, 520], [0, 500]] // davanti a sinistra (vita più bassa)
  const anchors = legAnchors(leg)
  near(anchors.front[0], 0) && near(anchors.front[1], 500) && near(anchors.back[0], 600) && near(anchors.back[1], 560)
    ? ok('gamba: centro davanti nell’angolo in vita più basso, centro dietro in quello più alto') : fail(JSON.stringify(anchors))
  const legL = pc('M', 'leg_left', leg, { x: 0, y: 500, bx: 600, by: 560 })
  const legR = pc('M', 'leg_right', leg.map(([x, y]) => [600 - x, y] as [number, number]), { x: 600, y: 500, bx: 0, by: 560 })
  const shorts = { id: 'p', name: 'S', product_type: 'simple', model_shape: 'shorts', sizes: ['M'], kit_items: [], customization_areas: [], print_zones: [] } as never
  const sc = {
    version: 1, optionValueIds: [], areas: {}, roster: [{ id: 'a', size: 'M', quantity: 1 }],
    elements: [
      { id: 'f', kind: 'graphic', zone: 'front', asset, xCm: 8, yCm: 6, widthCm: 6, rotation: 0, technique: 'sublimation' },
      { id: 'b', kind: 'graphic', zone: 'back', asset, xCm: -5, yCm: 4, widthCm: 6, rotation: 0, technique: 'sublimation' },
    ],
  } as never
  const sp = buildPlan({ product: shorts, config: sc, pieces: [legL, legR], referenceSize: { main: 'M' }, baseColor: '#FFFFFF', secondaryColor: null, textStyle: style, bleedMm: 5 })
  const jl = sp.jobs.find((j) => j.piece === 'leg_left')!, jr = sp.jobs.find((j) => j.piece === 'leg_right')!
  const fL = jl.placements[0].center, bL = jl.placements[1].center, fR = jr.placements[0].center
  jl.placements.length === 2 && jr.placements.length === 2 && near(fL[0], 80) && near(fL[1], 440) && near(bL[0], 550) && near(bL[1], 520) && near(fR[0], 680) && near(fR[1], 440)
    ? ok('gambe: davanti misurato dal centro davanti, dietro dal centro dietro, su entrambe le gambe') : fail(JSON.stringify({ l: jl.placements.map((p) => p.center), r: jr.placements.map((p) => p.center) }))
}

// Aree fisse dell'admin come ostacoli per le aree di stampa del cliente
{
  const zone = { id: 'z', product_id: 'p', kit_item_id: null, zone: 'front', x_cm: -15, y_cm: 5, width_cm: 30, height_cm: 30, max_items: 3, allow_graphic: true, allow_text: true, techniques: ['dtf'], sort_order: 0 } as never
  const tech = [{ code: 'dtf', name: 'DTF', min_price: 1.5, max_price: 5, all_over_only: false, is_active: true, sort_order: 0 }] as never
  const sponsor = { x1: -20, x2: 20, y1: 25, y2: 37 }
  const el = { id: 'a', kind: 'text', zone: 'front', text: 'X', xCm: 0, yCm: 28, widthCm: 20, heightCm: 5, rotation: 0, technique: 'dtf' } as never
  const issues = elementIssues(el, [el], [zone], tech, false, [sponsor])
  issues.includes('overlap_fixed') ? ok('area sopra lo sponsor fisso: segnalata') : fail(JSON.stringify(issues))
  elementIssues({ ...(el as object), yCm: 10 } as never, [el], [zone], tech, false, [sponsor]).length === 0 ? ok('area lontana dalle aree fisse: nessun problema') : fail('falso positivo')
  const slot = nextSlot({ x1: -15, y1: 5, x2: 15, y2: 35 }, [], 20, 5, 'y', [{ x1: -20, x2: 20, y1: 4, y2: 15 }])
  slot && slot.yCm - 2.5 >= 15 ? ok(`posizionamento automatico sotto l’area fissa (centro a ${slot.yCm} cm)`) : fail(JSON.stringify(slot))
}

// Intero busto, divisione in parti uguali, spazio utilizzabile e posizioni rapide
{
  const torso: Box = { x1: -18, y1: 2, x2: 18, y2: 62 }
  const sp = (id: string, w: number, h: number) => ({ id, kind: 'graphic', zone: 'front', xCm: 0, yCm: 10, widthCm: w, heightCm: h, rotation: 15, technique: 'dtf' }) as never as PlacedElement
  const four = [sp('a', 10, 5), sp('b', 10, 5), sp('c', 10, 10), sp('d', 4, 8)]
  const g = distribute(torso, four, 'grid')
  const cells = [...g.values()]
  const inside = cells.every((c, i) => insideBox(elementBox({ ...four[i], ...c }), torso))
  const noOverlap = cells.every((c, i) => cells.every((d, j) => j <= i || !boxesOverlap(elementBox({ ...four[i], ...c }), elementBox({ ...four[j], ...d }))))
  const quarters = new Set(cells.map((c) => `${c.xCm > 0}|${c.yCm > 32}`)).size === 4
  inside && noOverlap && quarters && cells.every((c) => c.rotation === 0)
    ? ok('4 grafiche a griglia: una per quarto, dentro l’area, senza sovrapposizioni') : fail(JSON.stringify(cells))
  const a = g.get('a')!, d = g.get('d')!
  near(a.heightCm! / a.widthCm, 0.5, 0.02) && near(d.heightCm! / d.widthCm, 2, 0.05) && near(a.widthCm, 17.5, 0.2)
    ? ok(`ogni grafica mantiene le proporzioni e riempie la sua parte (${a.widthCm}×${a.heightCm} cm)`) : fail(JSON.stringify({ a, d }))
  const rows = [...distribute(torso, [sp('a', 30, 10), sp('b', 30, 10)], 'rows').values()]
  rows[0].yCm < rows[1].yCm && near(rows[0].xCm, 0) && near(rows[0].widthCm, 36, 0.3) ? ok('due sponsor in colonna: uno sotto l’altro, a tutta larghezza') : fail(JSON.stringify(rows))
  const u = usableBox(torso, [{ x1: -16, x2: 16, y1: 10, y2: 35 }])
  near(u.y1, 35.5) && near(u.y2, 62) ? ok('spazio utilizzabile: la parte più grande libera dal numero sul dietro') : fail(JSON.stringify(u))
  const heart = quickSpot(torso, sp('h', 8, 8), 'heart'), opp = quickSpot(torso, sp('h', 8, 8), 'opposite')
  heart.xCm > 5 && opp.xCm < -5 && near(heart.xCm, -opp.xCm) && near(heart.yCm, opp.yCm) ? ok(`logo lato cuore a ${heart.xCm} cm, lato opposto a ${opp.xCm} cm, alla stessa altezza`) : fail(JSON.stringify({ heart, opp }))
  // davanti con scollo e giromanica: il rettangolo resta sotto lo scollo e dentro il busto
  const front: [number, number][] = [[0, 0], [500, 0], [500, 450], [440, 520], [430, 680], [320, 700], [250, 610], [180, 700], [70, 680], [60, 520], [0, 450]]
  const t = largestTorsoBox({ outline: front, anchor: { x: 250, y: 610 } })
  t && t.y1 >= 2 && t.x2 <= 17 && t.y2 <= 59 && near(t.x1, -t.x2) ? ok(`tutto il pezzo: ${t.x2 - t.x1}×${t.y2 - t.y1} cm sotto lo scollo e tra i giromanica`) : fail(JSON.stringify(t))
}

console.log(failures ? `\n${failures} TEST FALLITI` : '\nTutti i test superati')
process.exit(failures ? 1 : 0)
