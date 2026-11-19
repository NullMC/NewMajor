import { useEffect, useState, type ReactNode } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { useUi } from '@/components/ui/Toast'
import { FieldGrid, ReorderButtons, validateFields, type FieldDef } from './fields'

type Row = Record<string, unknown> & { id?: string; __dirty?: boolean; __key: string }

interface Props {
  table: string
  parentKey: string
  parentId: string
  rows: Record<string, unknown>[]
  fields: FieldDef[]
  defaults: Record<string, unknown>
  title: (row: Record<string, unknown>, index: number) => ReactNode
  addLabel: string
  onChanged: () => void
  sortable?: boolean
  emptyText?: string
  /** Contenuto extra sotto i campi di ogni riga (es. valori di un'opzione). */
  renderExtra?: (row: Record<string, unknown>) => ReactNode
}

let seq = 0
const withKey = (r: Record<string, unknown>): Row => ({ ...r, __key: (r.id as string) ?? `new-${++seq}` })

/** Editor in linea di record figli (varianti, opzioni, aree, scaglioni, componenti kit). */
export function ChildRowsEditor({ table, parentKey, parentId, rows, fields, defaults, title, addLabel, onChanged, sortable = true, emptyText, renderExtra }: Props) {
  const { toast, confirm } = useUi()
  const [items, setItems] = useState<Row[]>(() => rows.map(withKey))
  const [saving, setSaving] = useState<string | null>(null)
  // Risincronizza solo quando i dati salvati cambiano davvero (non a ogni render del genitore)
  const signature = JSON.stringify(rows)
  useEffect(() => {
    setItems((cur) => [...(JSON.parse(signature) as Record<string, unknown>[]).map(withKey), ...cur.filter((c) => !c.id)])
  }, [signature])

  const patch = (k: string, p: Record<string, unknown>) => setItems((list) => list.map((r) => (r.__key === k ? { ...r, ...p, __dirty: true } : r)))

  const save = async (row: Row) => {
    const err = validateFields(fields, row)
    if (err) return toast(err, 'error')
    setSaving(row.__key)
    try {
      const payload: Record<string, unknown> = { [parentKey]: parentId }
      for (const f of fields) payload[f.key] = row[f.key] ?? null
      if (sortable) payload.sort_order = row.sort_order ?? (items.indexOf(row) + 1) * 10
      if (row.id) {
        const { error } = await supabase.from(table).update(payload).eq('id', row.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from(table).insert(payload)
        if (error) throw error
        setItems((list) => list.filter((r) => r.__key !== row.__key))
      }
      onChanged()
      toast('Salvato')
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setSaving(null)
    }
  }

  const remove = async (row: Row) => {
    if (!row.id) return setItems((list) => list.filter((r) => r.__key !== row.__key))
    if (!(await confirm({ title: 'Eliminare questo elemento?', confirmLabel: 'Elimina', danger: true }))) return
    try {
      const { error } = await supabase.from(table).delete().eq('id', row.id)
      if (error) throw error
      onChanged()
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= items.length) return
    const list = [...items]
    ;[list[i], list[j]] = [list[j], list[i]]
    const updated = list.map((r, idx) => ({ ...r, sort_order: (idx + 1) * 10 }))
    setItems(updated)
    await Promise.all(updated.filter((r) => r.id).map((r) => supabase.from(table).update({ sort_order: r.sort_order }).eq('id', r.id!)))
    onChanged()
  }

  return (
    <div className="space-y-3">
      {!items.length && emptyText && <p className="rounded-xl border border-dashed border-ink-200 p-4 text-sm text-ink-500">{emptyText}</p>}
      {items.map((row, i) => (
        <div key={row.__key} className={cn('rounded-2xl border bg-white p-4', row.__dirty ? 'border-gold-400' : 'border-ink-200')}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-semibold">{title(row, i)}{!row.id && <span className="ml-2 text-xs font-medium text-gold-700">Nuovo</span>}</p>
            <div className="flex items-center gap-1">
              {sortable && row.id && <ReorderButtons label={String(title(row, i))} onUp={() => move(i, -1)} onDown={() => move(i, 1)} disabledUp={i === 0} disabledDown={i === items.length - 1} />}
              <button type="button" onClick={() => void remove(row)} className="rounded-lg p-1.5 text-ink-400 hover:bg-danger-50 hover:text-danger-600" aria-label="Elimina">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          <FieldGrid fields={fields} values={row} onChange={(p) => patch(row.__key, p)} />
          <div className="mt-3 flex justify-end">
            <Button size="sm" variant={row.__dirty || !row.id ? 'primary' : 'secondary'} loading={saving === row.__key} icon={<Save className="h-4 w-4" />} onClick={() => void save(row)}>
              Salva
            </Button>
          </div>
          {row.id && renderExtra?.(row)}
        </div>
      ))}
      <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setItems((list) => [...list, withKey({ ...defaults })])}>
        {addLabel}
      </Button>
    </div>
  )
}
