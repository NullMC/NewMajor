import { useState } from 'react'
import { ClipboardPaste, Copy, Eye, Minus, Plus, Trash2 } from 'lucide-react'
import type { RosterEntry } from '@/types/config'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/format'
import { uid } from '@/lib/slug'
import { Button } from '@/components/ui/Button'
import { Input, Select, Switch, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Overlay'
import type { ConfiguratorApi } from '../useConfigurator'

function QtyStepper({ value, onChange, min = 1, label }: { value: number; onChange: (v: number) => void; min?: number; label: string }) {
  return (
    <div className="inline-flex h-11 items-center rounded-xl border border-ink-200 bg-white">
      <button type="button" className="flex h-full w-10 items-center justify-center text-ink-600 hover:text-ink-900 disabled:opacity-40" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Diminuisci ${label}`}>
        <Minus className="h-4 w-4" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={9999}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(9999, Number(e.target.value) || min)))}
        className="h-full w-14 border-0 bg-transparent text-center text-sm font-semibold focus:outline-none focus:ring-0"
        aria-label={label}
      />
      <button type="button" className="flex h-full w-10 items-center justify-center text-ink-600 hover:text-ink-900" onClick={() => onChange(Math.min(9999, value + 1))} aria-label={`Aumenta ${label}`}>
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}

export { QtyStepper }

export function RosterSection({ api }: { api: ConfiguratorApi }) {
  const { product, config } = api
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const textAreas = product.customization_areas.filter((a) => a.is_active && (a.area_type === 'text' || a.area_type === 'number'))
  const nameArea = textAreas.find((a) => a.area_type === 'text' && config.areas[a.id]?.enabled)
  const numberArea = textAreas.find((a) => a.area_type === 'number' && config.areas[a.id]?.enabled)
  const isKit = product.product_type === 'kit'
  const sizedKitItems = product.kit_items.filter((k) => k.sizes.length)
  const nameMax = nameArea?.max_chars ?? 16
  const numberMax = Math.min(numberArea?.max_chars ?? 3, 4)

  if (!api.roster) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-ink-200 bg-white p-4">
        <div>
          <p className="text-sm font-semibold">Quantità</p>
          {product.min_quantity > 1 && <p className="text-xs text-ink-500">Minimo {product.min_quantity} pezzi</p>}
        </div>
        <QtyStepper value={api.quantity} onChange={api.setQuantity} min={product.min_quantity} label="quantità" />
      </div>
    )
  }

  const rows = config.roster
  const update = (id: string, p: Partial<RosterEntry>) => api.setRoster(rows.map((r) => (r.id === id ? { ...r, ...p } : r)))
  const remove = (id: string) => api.setRoster(rows.filter((r) => r.id !== id))
  const duplicate = (r: RosterEntry) => {
    const i = rows.findIndex((x) => x.id === r.id)
    const next = [...rows]
    next.splice(i + 1, 0, { ...r, id: uid() })
    api.setRoster(next)
  }
  const add = () => {
    const last = rows[rows.length - 1]
    api.setRoster([...rows, { id: uid(), quantity: 1, size: last?.size, sizes: last?.sizes ? { ...last.sizes } : undefined }])
  }

  const applyPaste = () => {
    // Formato per riga: Nome; Numero; Taglia; Quantità  (separatori ; , tab)
    const sizes = product.sizes.map((s) => s.toUpperCase())
    const parsed: RosterEntry[] = pasteText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const [name = '', number = '', size = '', qty = ''] = line.split(/\t|;|,/).map((s) => s.trim())
        const sz = size.toUpperCase()
        return {
          id: uid(),
          name: name.slice(0, nameMax),
          number: number.replace(/\D/g, '').slice(0, numberMax),
          size: !isKit && sizes.includes(sz) ? product.sizes[sizes.indexOf(sz)] : undefined,
          quantity: Math.max(1, Number(qty) || 1),
        }
      })
    if (parsed.length) {
      const keepExisting = rows.filter((r) => r.name || r.number)
      api.setRoster([...keepExisting, ...parsed])
    }
    setPasteText('')
    setPasteOpen(false)
  }

  return (
    <div className="space-y-4">
      {textAreas.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-ink-200 bg-white p-4">
          {textAreas.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{a.name}</p>
                <p className="text-xs text-ink-500">
                  {a.side === 'front' ? 'Fronte' : 'Retro'}{Number(a.price_delta) > 0 && ` · +${formatPrice(a.price_delta)} a capo`}
                </p>
              </div>
              <Switch
                label={`Attiva ${a.name}`}
                checked={!!config.areas[a.id]?.enabled}
                disabled={a.is_required}
                onChange={(v) => { api.setArea(a.id, { enabled: v }); api.setView(a.side) }}
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-600">
          <span className="font-semibold text-ink-900">{api.qty}</span> {api.qty === 1 ? 'capo' : 'capi'}
          {isKit && ' (kit)'}
          {product.min_quantity > 1 && <span className="text-ink-500"> · minimo {product.min_quantity}</span>}
        </p>
        <Button variant="ghost" size="sm" icon={<ClipboardPaste className="h-4 w-4" />} onClick={() => setPasteOpen(true)}>
          Incolla elenco
        </Button>
      </div>

      <ol className="space-y-2">
        {rows.map((r, i) => (
          <li key={r.id} className={cn('rounded-2xl border bg-white p-3', api.previewRow === i ? 'border-ink-900' : 'border-ink-200')}>
            <div className="flex items-center justify-between gap-2 pb-2">
              <span className="text-xs font-semibold text-ink-500">#{i + 1}</span>
              <div className="flex items-center">
                {(nameArea || numberArea) && (
                  <button type="button" onClick={() => api.setPreviewRow(i)} className={cn('inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-ink-100', api.previewRow === i ? 'text-ink-900' : 'text-ink-400')} aria-label={`Mostra riga ${i + 1} nell’anteprima`} aria-pressed={api.previewRow === i}>
                    <Eye className="h-4 w-4" />
                  </button>
                )}
                <button type="button" onClick={() => duplicate(r)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-900" aria-label={`Duplica riga ${i + 1}`}>
                  <Copy className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => remove(r.id)} disabled={rows.length <= 1} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-400 hover:bg-danger-50 hover:text-danger-600 disabled:opacity-30" aria-label={`Elimina riga ${i + 1}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_4.5rem_minmax(6rem,auto)_auto]">
              {nameArea && (
                <Input
                  aria-label={`Nome riga ${i + 1}`}
                  placeholder="Nome"
                  maxLength={nameMax}
                  value={r.name ?? ''}
                  onFocus={() => { api.setPreviewRow(i); api.setView(nameArea.side) }}
                  onChange={(e) => update(r.id, { name: e.target.value })}
                  className="col-span-2 sm:col-span-1"
                />
              )}
              {numberArea && (
                <Input
                  aria-label={`Numero riga ${i + 1}`}
                  placeholder="N°"
                  inputMode="numeric"
                  maxLength={numberMax}
                  value={r.number ?? ''}
                  onFocus={() => { api.setPreviewRow(i); api.setView(numberArea.side) }}
                  onChange={(e) => update(r.id, { number: e.target.value.replace(/\D/g, '').slice(0, numberMax) })}
                />
              )}
              {!isKit && product.sizes.length > 0 && (
                <Select aria-label={`Taglia riga ${i + 1}`} value={r.size ?? ''} onChange={(e) => update(r.id, { size: e.target.value || undefined })}>
                  <option value="">Taglia</option>
                  {product.sizes.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              )}
              {isKit && sizedKitItems.map((k) => (
                <Select
                  key={k.id}
                  aria-label={`Taglia ${k.label} riga ${i + 1}`}
                  value={r.sizes?.[k.id] ?? ''}
                  onChange={(e) => update(r.id, { sizes: { ...(r.sizes ?? {}), [k.id]: e.target.value } })}
                >
                  <option value="">{k.label}</option>
                  {k.sizes.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              ))}
              <div className="col-span-2 sm:col-span-1">
                <QtyStepper value={r.quantity} onChange={(v) => update(r.id, { quantity: v })} label={`quantità riga ${i + 1}`} />
              </div>
            </div>
          </li>
        ))}
      </ol>
      <Button variant="secondary" className="w-full" icon={<Plus className="h-4 w-4" />} onClick={add}>
        Aggiungi {nameArea || numberArea ? 'giocatore' : 'riga'}
      </Button>

      <Modal
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        title="Incolla elenco"
        description="Una riga per capo: Nome; Numero; Taglia; Quantità. Puoi copiare direttamente da un foglio di calcolo."
        footer={<><Button variant="secondary" onClick={() => setPasteOpen(false)}>Annulla</Button><Button onClick={applyPaste}>Importa</Button></>}
      >
        <Textarea rows={10} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={'ROSSI; 10; M; 1\nBIANCHI; 7; L; 1'} aria-label="Elenco giocatori" />
        {isKit && <p className="mt-2 text-xs text-ink-500">Per i kit le taglie dei singoli componenti vanno selezionate dopo l’importazione.</p>}
      </Modal>
    </div>
  )
}
