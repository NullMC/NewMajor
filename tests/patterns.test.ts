// Test dell'importatore DXF con un cartamodello DEMO (misure note, non per produzione).
import { parseDxf } from '../src/lib/patterns/dxf'
import { autoAnchor, bounds } from '../src/lib/patterns/geometry'
import { elementCenterMm, elementCornersMm, placementIssue } from '../src/lib/patterns/placement'

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

console.log(failures ? `\n${failures} TEST FALLITI` : '\nTutti i test superati')
process.exit(failures ? 1 : 0)
