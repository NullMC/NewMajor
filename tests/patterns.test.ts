// Test dell'importatore DXF con un cartamodello DEMO (misure note, non per produzione).
import { parseDxf } from '../src/lib/patterns/dxf'
import { autoAnchor, bounds } from '../src/lib/patterns/geometry'

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

console.log(failures ? `\n${failures} TEST FALLITI` : '\nTutti i test superati')
process.exit(failures ? 1 : 0)
