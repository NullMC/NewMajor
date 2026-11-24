// Test di cartamodelli, posizionamento e produzione con dati DEMO (misure note, non per produzione).
import { parseDxf } from '../src/lib/patterns/dxf'
import { autoAnchor, bounds } from '../src/lib/patterns/geometry'
import { elementCenterMm, elementCornersMm, placementIssue } from '../src/lib/patterns/placement'
import { offsetOutline } from '../src/lib/production/offset'
import { layoutPieces } from '../src/lib/production/layout'
import { buildPlan, type ProductionPiece } from '../src/lib/production/plan'

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
}

console.log(failures ? `\n${failures} TEST FALLITI` : '\nTutti i test superati')
process.exit(failures ? 1 : 0)
