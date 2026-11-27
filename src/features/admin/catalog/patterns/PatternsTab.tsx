// Scheda "Cartamodelli" del prodotto: importazione dei pezzi reali (DXF/SVG) per taglia,
// revisione di tipo, quantità e punto di riferimento, controlli di completezza.

import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, FileUp, Pencil, Trash2 } from 'lucide-react'
import type { ProductDetail } from '@/types/db'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { bounds, defaultAnchor, mirrorX, normalizeOrigin, PIECE_LABEL, round, type PieceAnchor, type PieceKind } from '@/lib/patterns/geometry'
import { parseDxf, type ImportedPiece, type SourceUnit } from '@/lib/patterns/dxf'
import { parseSvg } from '@/lib/patterns/svg'
import { useQuery } from '@/hooks/useQuery'
import { Button } from '@/components/ui/Button'
import { Badge, Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/Display'
import { Field, Input, Select } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Overlay'
import { useUi } from '@/components/ui/Toast'
import {
  createSet, deletePiece, deleteSet, insertPieces, listPatternSets, listPieces, sourceDownloadUrl, updatePiece, updateSet, uploadSource,
  type NewPiece, type PatternPiece, type PatternSet,
} from './api'
import { PieceShape } from './PieceShape'

const KINDS = Object.keys(PIECE_LABEL) as PieceKind[]
const cm = (mm: number) => `${round(mm / 10, 1)}`.replace('.', ',')

interface Target { kitItemId: string | null; label: string; sizes: string[] }

export function PatternsTab({ product }: { product: ProductDetail }) {
  const targets: Target[] = useMemo(() => (
    product.product_type === 'kit' && product.kit_items.length
      ? product.kit_items.map((k) => ({ kitItemId: k.id, label: k.label, sizes: k.sizes.length ? k.sizes : product.sizes }))
      : [{ kitItemId: null, label: product.name, sizes: product.sizes }]
  ), [product])
  const [targetIdx, setTargetIdx] = useState(0)
  const target = targets[Math.min(targetIdx, targets.length - 1)]
  const { data: sets, loading, reload } = useQuery(`admin:patterns:${product.id}`, () => listPatternSets(product.id))
  const set = (sets ?? []).find((s) => s.kit_item_id === target.kitItemId && !s.garment_type_id) ?? null

  return (
    <div className="space-y-6">
      <Card className="p-5 text-sm leading-6 text-ink-600">
        <p>
          Importa i <strong>cartamodelli reali</strong> del capo, esportati dal CAD in <strong>DXF AAMA/ASTM</strong> (linea di taglio sullo strato 1)
          oppure in <strong>SVG</strong> in scala reale. Servono a generare il file di stampa: ogni grafica viene posizionata in centimetri rispetto al
          punto di riferimento del pezzo (centro collo per davanti e dietro, punto più alto della testa per le maniche), con la stessa misura su tutte le taglie.
        </p>
        {targets.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Componente del kit">
            {targets.map((t, i) => (
              <button key={t.kitItemId ?? 'main'} type="button" onClick={() => setTargetIdx(i)} aria-pressed={i === targetIdx}
                className={cn('rounded-full px-4 py-1.5 text-sm font-semibold ring-1 transition', i === targetIdx ? 'bg-ink-900 text-white ring-ink-900' : 'ring-ink-200 hover:ring-ink-400')}>
                {t.label}
              </button>
            ))}
          </div>
        )}
      </Card>

      {loading && !sets ? <Skeleton className="h-40" /> : set ? (
        <PatternSetView key={set.id} set={set} target={target} productId={product.id} onChanged={reload} />
      ) : (
        <EmptyState
          title="Nessun cartamodello"
          description={`Importa i pezzi di ${target.label} per abilitare il file di stampa di questo prodotto.`}
          action={<ImportButton productId={product.id} target={target} set={null} onDone={reload} />}
        />
      )}

    </div>
  )
}

function PatternSetView({ set, target, productId, onChanged }: { set: PatternSet; target: Target; productId: string; onChanged: () => void }) {
  const { toast, confirm } = useUi()
  const { data: pieces, loading, reload, setData } = useQuery(`admin:pattern-pieces:${set.id}`, () => listPieces(set.id))
  const [editing, setEditing] = useState<PatternPiece | null>(null)
  const sizes = useMemo(() => {
    const present = [...new Set((pieces ?? []).map((p) => p.size))]
    const order = (s: string) => { const i = target.sizes.indexOf(s); return i < 0 ? 999 : i }
    return present.sort((a, b) => order(a) - order(b) || a.localeCompare(b))
  }, [pieces, target.sizes])

  const issues = useMemo(() => {
    const out: string[] = []
    if (!pieces) return out
    const missing = target.sizes.filter((s) => !sizes.includes(s))
    if (missing.length) out.push(`Taglie del prodotto senza pezzi: ${missing.join(', ')}.`)
    for (const s of sizes) {
      const kinds = new Set(pieces.filter((p) => p.size === s).map((p) => p.piece))
      const lack = (['front', 'back'] as const).filter((k) => !kinds.has(k)).map((k) => PIECE_LABEL[k].toLowerCase())
      if (lack.length) out.push(`Taglia ${s}: manca ${lack.join(' e ')}.`)
      if (kinds.has('sleeve_left') !== kinds.has('sleeve_right')) out.push(`Taglia ${s}: è presente una sola manica (servono sinistra e destra per le grafiche sulle maniche).`)
    }
    if (!set.reference_size) out.push('Scegli la taglia di riferimento (usata per l’anteprima nel configuratore).')
    if (pieces.some((p) => p.anchor?.x == null || p.anchor?.y == null)) out.push('Alcuni pezzi non hanno il punto di riferimento.')
    return out
  }, [pieces, sizes, target.sizes, set.reference_size])

  const patch = async (p: PatternPiece, change: Partial<PatternPiece>) => {
    setData((d) => (d ?? []).map((x) => (x.id === p.id ? { ...x, ...change } : x)))
    try { await updatePiece(p.id, change) } catch (e) { toast(errorMessage(e), 'error'); void reload() }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={set.name}
          description={set.source_name ? `File: ${set.source_name}` : undefined}
          action={
            <div className="flex flex-wrap gap-2">
              {set.source_path && (
                <Button size="sm" variant="secondary" icon={<Download className="h-4 w-4" />}
                  onClick={async () => { try { window.open(await sourceDownloadUrl(set.source_path!, set.source_name), '_blank', 'noopener') } catch (e) { toast(errorMessage(e), 'error') } }}>
                  File originale
                </Button>
              )}
              <ImportButton productId={productId} target={target} set={set} onDone={() => { void reload(); onChanged() }} />
              <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={async () => {
                if (!(await confirm({ title: 'Eliminare il cartamodello?', message: 'Verranno eliminati tutti i pezzi e il file originale. Gli ordini già generati non cambiano.', confirmLabel: 'Elimina', danger: true }))) return
                try { await deleteSet(set); onChanged() } catch (e) { toast(errorMessage(e), 'error') }
              }}>Elimina</Button>
            </div>
          }
        />
        <div className="grid gap-4 p-5 sm:grid-cols-[14rem_minmax(0,1fr)] sm:items-start">
          <Field label="Taglia di riferimento" hint="Usata per l’anteprima e per convertire le posizioni in centimetri.">
            <Select value={set.reference_size ?? ''} onChange={async (e) => {
              try { await updateSet(set.id, { reference_size: e.target.value || null }); onChanged() } catch (err) { toast(errorMessage(err), 'error') }
            }}>
              <option value="">—</option>
              {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <div className="space-y-2 text-sm" aria-live="polite">
            {!pieces ? null : issues.length ? issues.map((i) => (
              <p key={i} className="flex gap-2 text-warning-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{i}</p>
            )) : (
              <p className="flex gap-2 text-success-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />Cartamodello completo: tutte le taglie hanno davanti, dietro e punti di riferimento.</p>
            )}
          </div>
        </div>
      </Card>

      {loading && !pieces ? <Skeleton className="h-60" /> : sizes.map((size) => (
        <Card key={size}>
          <CardHeader title={`Taglia ${size}`} description={`${pieces!.filter((p) => p.size === size).length} pezzi`} />
          <ul className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {pieces!.filter((p) => p.size === size).map((p) => {
              const b = bounds(p.outline)
              return (
                <li key={p.id} className="surface flex flex-col gap-3 p-3">
                  <button type="button" onClick={() => setEditing(p)} className="rounded-lg bg-ink-50 p-2 transition hover:bg-ink-100" aria-label={`Modifica il punto di riferimento di ${p.name}`}>
                    <PieceShape outline={p.outline} anchor={p.anchor} grainAngle={p.grain_angle} className="mx-auto h-36 w-full" />
                  </button>
                  <Input value={p.name} onChange={(e) => setData((d) => (d ?? []).map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))}
                    onBlur={(e) => void patch(p, { name: e.target.value.trim() || p.name })} aria-label="Nome pezzo" className="h-9 text-sm" />
                  <div className="grid grid-cols-[minmax(0,1fr)_4.5rem] gap-2">
                    <Select value={p.piece} onChange={(e) => {
                      const piece = e.target.value as PieceKind
                      void patch(p, { piece, anchor: defaultAnchor(p.outline, piece) })
                    }} aria-label="Tipo di pezzo" className="h-9 text-sm">
                      {KINDS.map((k) => <option key={k} value={k}>{PIECE_LABEL[k]}</option>)}
                    </Select>
                    <Input type="number" min={1} max={20} value={p.quantity} onChange={(e) => void patch(p, { quantity: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} aria-label="Quantità" className="h-9 text-sm" />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-ink-500">
                    <span className="font-mono">{cm(b.width)} × {cm(b.height)} cm</span>
                    <span className="flex gap-1">
                      <button type="button" onClick={() => setEditing(p)} className="rounded-lg p-1.5 hover:bg-ink-100 hover:text-ink-900" aria-label={`Riferimento e drittofilo di ${p.name}`}><Pencil className="h-4 w-4" /></button>
                      <button type="button" onClick={async () => {
                        if (!(await confirm({ title: `Eliminare ${p.name} (${p.size})?`, confirmLabel: 'Elimina', danger: true }))) return
                        try { await deletePiece(p.id); setData((d) => (d ?? []).filter((x) => x.id !== p.id)) } catch (e) { toast(errorMessage(e), 'error') }
                      }} className="rounded-lg p-1.5 hover:bg-danger-50 hover:text-danger-600" aria-label={`Elimina ${p.name}`}><Trash2 className="h-4 w-4" /></button>
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      ))}

      {editing && (
        <AnchorEditor piece={editing} onClose={() => setEditing(null)} onSave={async (change) => { await patch(editing, change); setEditing(null) }} />
      )}
    </div>
  )
}

function AnchorEditor({ piece, onClose, onSave }: { piece: PatternPiece; onClose: () => void; onSave: (c: Partial<PatternPiece>) => Promise<void> }) {
  const isLeg = piece.piece === 'leg_left' || piece.piece === 'leg_right'
  const [anchor, setAnchor] = useState<PieceAnchor & { x: number; y: number }>(() => {
    const auto = defaultAnchor(piece.outline, piece.piece) as PieceAnchor & { x: number; y: number }
    if (piece.anchor?.x != null && piece.anchor?.y != null) return { ...auto, ...piece.anchor, x: piece.anchor.x, y: piece.anchor.y }
    return auto
  })
  const [grain, setGrain] = useState(piece.grain_angle)
  const [saving, setSaving] = useState(false)
  const b = bounds(piece.outline)
  const isSleeve = piece.piece === 'sleeve_left' || piece.piece === 'sleeve_right'
  return (
    <Modal open onClose={onClose} size="lg" title={`${piece.name} · taglia ${piece.size}`}
      description={isLeg ? 'Gamba con davanti e dietro uniti: il punto trascinabile è il centro davanti in vita; il centro dietro in vita si imposta nei campi. Le grafiche del davanti e del dietro si misurano da questi due punti.' : isSleeve ? 'Trascina il punto sulla sommità della testa della manica: le grafiche delle maniche si misurano da qui.' : 'Trascina il punto sul centro del collo: le grafiche si misurano da qui, lungo la linea centrale.'}
      footer={<>
        <Button variant="ghost" onClick={() => setAnchor(defaultAnchor(piece.outline, piece.piece) as PieceAnchor & { x: number; y: number })}>Proposta automatica</Button>
        <Button loading={saving} onClick={async () => { setSaving(true); await onSave({ anchor, grain_angle: grain }); setSaving(false) }}>Salva</Button>
      </>}>
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <div className="rounded-xl bg-ink-50 p-3">
          <PieceShape outline={piece.outline} anchor={anchor} onAnchor={(a) => setAnchor({ ...anchor, ...a })} grainAngle={grain} className="mx-auto h-[min(60vh,28rem)] w-full touch-none" />
        </div>
        <div className="space-y-4 text-sm">
          <Field label={isLeg ? 'Centro davanti X (mm)' : 'Riferimento X (mm)'}><Input type="number" step="0.5" value={anchor.x} onChange={(e) => setAnchor({ ...anchor, x: Number(e.target.value) })} /></Field>
          <Field label={isLeg ? 'Centro davanti Y (mm)' : 'Riferimento Y (mm)'}><Input type="number" step="0.5" value={anchor.y} onChange={(e) => setAnchor({ ...anchor, y: Number(e.target.value) })} /></Field>
          {isLeg && <>
            <Field label="Centro dietro X (mm)"><Input type="number" step="0.5" value={anchor.bx ?? ''} onChange={(e) => setAnchor({ ...anchor, bx: Number(e.target.value) })} /></Field>
            <Field label="Centro dietro Y (mm)"><Input type="number" step="0.5" value={anchor.by ?? ''} onChange={(e) => setAnchor({ ...anchor, by: Number(e.target.value) })} /></Field>
          </>}
          <Field label="Drittofilo (°)" hint="0 = verticale"><Input type="number" step="0.5" min={-90} max={90} value={grain} onChange={(e) => setGrain(Number(e.target.value))} /></Field>
          <p className="font-mono text-xs text-ink-500">Pezzo {cm(b.width)} × {cm(b.height)} cm</p>
        </div>
      </div>
    </Modal>
  )
}

interface Draft extends ImportedPiece { include: boolean; splitSleeves: boolean }

function ImportButton({ productId, target, set, onDone }: { productId: string; target: Target; set: PatternSet | null; onDone: () => void }) {
  const { toast } = useUi()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [unit, setUnit] = useState<SourceUnit | 'auto'>('auto')
  const [size, setSize] = useState('')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [replace, setReplace] = useState(true)
  const [busy, setBusy] = useState(false)

  const read = async (f: File, u: SourceUnit | 'auto') => {
    try {
      const text = await f.text()
      const isSvg = f.name.toLowerCase().endsWith('.svg') || text.trimStart().startsWith('<')
      const res = isSvg ? parseSvg(text, u === 'auto' ? 'mm' : u) : parseDxf(text, u === 'auto' ? null : u)
      setDrafts(res.pieces.map((p) => ({ ...p, include: true, splitSleeves: p.kind.startsWith('sleeve') && p.quantity >= 2 })))
      setWarnings(res.warnings)
    } catch (e) {
      setDrafts([])
      setWarnings([errorMessage(e)])
    }
  }

  const sizeOf = (d: Draft) => d.size || size
  const ready = drafts.some((d) => d.include) && drafts.filter((d) => d.include).every((d) => sizeOf(d))

  const submit = async () => {
    if (!file) return
    setBusy(true)
    try {
      const current = set ?? await createSet({ product_id: productId, kit_item_id: target.kitItemId, garment_type_id: null, name: `Cartamodello ${target.label}`.slice(0, 120) })
      const source_path = await uploadSource(productId, file)
      const rows: NewPiece[] = []
      drafts.filter((d) => d.include).forEach((d, i) => {
        const mk = (kind: PieceKind, outline = d.outline, quantity = d.quantity, suffix = ''): NewPiece => {
          return { size: sizeOf(d), piece: kind, name: `${d.name}${suffix}`.slice(0, 120), quantity, outline, anchor: defaultAnchor(outline, kind), mirror: false, grain_angle: d.grainAngle, sort_order: i * 2 }
        }
        if (d.splitSleeves) {
          // una manica tagliata in coppia diventa sinistra + destra (specchiata), per grafiche diverse sui due lati
          rows.push(mk('sleeve_left', d.outline, 1, ' (sx)'))
          rows.push({ ...mk('sleeve_right', normalizeOrigin(mirrorX(d.outline)), 1, ' (dx)'), sort_order: i * 2 + 1 })
        } else rows.push(mk(d.kind))
      })
      await insertPieces(current.id, rows, replace ? [...new Set(rows.map((r) => r.size))] : [])
      await updateSet(current.id, {
        source_path, source_name: file.name.slice(0, 200), source_unit: unit === 'auto' ? 'mm' : unit,
        ...(!current.reference_size ? { reference_size: rows[0]?.size ?? null } : {}),
      })
      toast(`${rows.length} pezzi importati`)
      setOpen(false)
      setFile(null)
      setDrafts([])
      onDone()
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button size="sm" icon={<FileUp className="h-4 w-4" />} onClick={() => setOpen(true)}>{set ? 'Importa altri pezzi' : 'Importa cartamodello'}</Button>
      {open && (
        <Modal open onClose={() => setOpen(false)} size="xl" title="Importa cartamodello" description="DXF AAMA/ASTM o SVG in scala reale. Puoi importare un file per taglia o un file con tutte le taglie."
          footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Annulla</Button><Button loading={busy} disabled={!ready} onClick={() => void submit()}>Importa {drafts.filter((d) => d.include).length || ''} pezzi</Button></>}>
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="File (.dxf o .svg)">
                <Input type="file" accept=".dxf,.svg,image/svg+xml,application/dxf" onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f) void read(f, unit) }} />
              </Field>
              <Field label="Unità del file" hint="Automatica: dal file DXF, altrimenti millimetri.">
                <Select value={unit} onChange={(e) => { const u = e.target.value as SourceUnit | 'auto'; setUnit(u); if (file) void read(file, u) }}>
                  <option value="auto">Automatica</option><option value="mm">Millimetri</option><option value="cm">Centimetri</option><option value="in">Pollici</option>
                </Select>
              </Field>
              <Field label="Taglia" hint="Per i pezzi senza taglia nel file.">
                <Select value={size} onChange={(e) => setSize(e.target.value)}>
                  <option value="">—</option>
                  {target.sizes.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </Field>
            </div>
            {warnings.map((w) => <p key={w} className="flex gap-2 rounded-xl bg-warning-50 p-3 text-sm text-warning-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{w}</p>)}
            {drafts.length > 0 && (
              <>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="h-4 w-4 accent-ink-900" /> Sostituisci i pezzi già presenti nelle stesse taglie</label>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {drafts.map((d, i) => {
                    const b = bounds(d.outline)
                    const set_ = (c: Partial<Draft>) => setDrafts((all) => all.map((x, j) => (j === i ? { ...x, ...c } : x)))
                    return (
                      <li key={i} className={cn('surface space-y-2 p-3', !d.include && 'opacity-50')}>
                        <div className="flex items-start gap-3">
                          <PieceShape outline={d.outline} className="h-20 w-16 shrink-0" />
                          <div className="min-w-0 flex-1 space-y-2">
                            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={d.include} onChange={(e) => set_({ include: e.target.checked })} className="h-4 w-4 accent-ink-900" /><span className="truncate">{d.name}</span></label>
                            <p className="font-mono text-xs text-ink-500">{cm(b.width)} × {cm(b.height)} cm · {d.size ? `taglia ${d.size}` : size ? `taglia ${size}` : <span className="text-danger-600">taglia da scegliere</span>}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_4rem] gap-2">
                          <Select value={d.kind} onChange={(e) => { const kind = e.target.value as PieceKind; set_({ kind, splitSleeves: kind.startsWith('sleeve') && d.quantity >= 2 }) }} aria-label="Tipo di pezzo" className="h-9 text-sm">
                            {KINDS.map((k) => <option key={k} value={k}>{PIECE_LABEL[k]}</option>)}
                          </Select>
                          <Input type="number" min={1} max={20} value={d.quantity} onChange={(e) => set_({ quantity: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} aria-label="Quantità" className="h-9 text-sm" />
                        </div>
                        {d.kind.startsWith('sleeve') && d.quantity >= 2 && (
                          <label className="flex items-center gap-2 text-xs text-ink-600"><input type="checkbox" checked={d.splitSleeves} onChange={(e) => set_({ splitSleeves: e.target.checked })} className="h-4 w-4 accent-ink-900" /> Crea manica sinistra e destra (specchiata)</label>
                        )}
                      </li>
                    )
                  })}
                </ul>
                <p className="text-xs text-ink-500"><Badge>Nota</Badge> Le misure mostrate sono quelle lette dal file: controllale con il cartamodello prima di usarlo in produzione.</p>
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}
