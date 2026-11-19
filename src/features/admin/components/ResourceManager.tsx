import { useMemo, useState, type ReactNode } from 'react'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { removePublic } from '@/lib/storage'
import { invalidate, useQuery } from '@/hooks/useQuery'
import { Button } from '@/components/ui/Button'
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/Display'
import { FormError, Input } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Overlay'
import { DataTable, type Column } from '@/components/ui/Table'
import { useUi } from '@/components/ui/Toast'
import { FieldGrid, ReorderButtons, validateFields, type FieldDef } from './fields'

type Row = Record<string, unknown> & { id: string }

export interface ResourceConfig<T extends Row> {
  table: string
  title: string
  description?: ReactNode
  singular: string
  fields: FieldDef[]
  columns: Column<T>[]
  defaults: Partial<T>
  searchKeys?: (keyof T & string)[]
  /** Campo ordinamento manuale (es. sort_order). */
  sortable?: boolean
  /** Soft delete tramite deleted_at. */
  softDelete?: boolean
  /** Chiavi immagine da eliminare dallo storage alla sostituzione/eliminazione. */
  imageKeys?: (keyof T & string)[]
  select?: string
  orderBy?: { column: string; ascending?: boolean }[]
  /** Cache da invalidare dopo le modifiche (prefissi). */
  invalidates?: string[]
  transform?: (values: Partial<T>) => Partial<T>
  actions?: ReactNode
}

export function ResourceManager<T extends Row>({ config }: { config: ResourceConfig<T> }) {
  const { toast, confirm } = useUi()
  const key = `admin:${config.table}`
  const { data, loading, reload, setData } = useQuery<T[]>(key, async () => {
    let q = supabase.from(config.table).select(config.select ?? '*')
    if (config.softDelete) q = q.is('deleted_at', null)
    for (const o of config.orderBy ?? (config.sortable ? [{ column: 'sort_order' }] : [{ column: 'created_at', ascending: false }])) {
      q = q.order(o.column, { ascending: o.ascending ?? true })
    }
    const { data: rows, error } = await q
    if (error) throw error
    return rows as unknown as T[]
  })
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<{ id?: string; values: Partial<T>; original?: Partial<T> } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term || !config.searchKeys) return data ?? []
    return (data ?? []).filter((r) => config.searchKeys!.some((k) => String(r[k] ?? '').toLowerCase().includes(term)))
  }, [data, search, config.searchKeys])

  const after = () => {
    invalidate(key)
    for (const p of config.invalidates ?? []) invalidate(p)
  }

  const save = async () => {
    if (!editing) return
    const err = validateFields(config.fields, editing.values)
    if (err) return setError(err)
    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {}
      for (const f of config.fields) payload[f.key] = editing.values[f.key as keyof T] ?? null
      const final = config.transform ? config.transform(payload as Partial<T>) : payload
      if (editing.id) {
        const { error: e } = await supabase.from(config.table).update(final).eq('id', editing.id)
        if (e) throw e
      } else {
        if (config.sortable && final.sort_order === undefined) final.sort_order = ((data ?? []).length + 1) * 10
        const { error: e } = await supabase.from(config.table).insert(final)
        if (e) throw e
      }
      // Elimina dallo storage le immagini sostituite
      for (const k of config.imageKeys ?? []) {
        const before = editing.original?.[k] as string | null | undefined
        if (before && before !== final[k]) await removePublic([before]).catch(() => undefined)
      }
      after()
      await reload()
      setEditing(null)
      toast(`${config.singular} salvato`)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (row: T) => {
    const ok = await confirm({
      title: `Eliminare ${config.singular.toLowerCase()}?`,
      message: config.softDelete ? 'L’elemento verrà archiviato e non sarà più visibile sul sito.' : 'L’operazione non può essere annullata.',
      confirmLabel: 'Elimina',
      danger: true,
    })
    if (!ok) return
    try {
      if (config.softDelete) {
        const { error: e } = await supabase.from(config.table).update({ deleted_at: new Date().toISOString() }).eq('id', row.id)
        if (e) throw e
      } else {
        const { error: e } = await supabase.from(config.table).delete().eq('id', row.id)
        if (e) throw e
        await removePublic((config.imageKeys ?? []).map((k) => row[k] as string | null)).catch(() => undefined)
      }
      after()
      setData((d) => (d ?? []).filter((r) => r.id !== row.id))
      toast(`${config.singular} eliminato`)
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  const move = async (index: number, dir: -1 | 1) => {
    const list = [...(data ?? [])]
    const j = index + dir
    if (j < 0 || j >= list.length) return
    ;[list[index], list[j]] = [list[j], list[index]]
    const updated = list.map((r, i) => ({ ...r, sort_order: (i + 1) * 10 }))
    setData(updated)
    try {
      await Promise.all(
        [updated[index], updated[j]].map((r) => supabase.from(config.table).update({ sort_order: r.sort_order }).eq('id', r.id)),
      )
      after()
    } catch (e) {
      toast(errorMessage(e), 'error')
      void reload()
    }
  }

  const columns: Column<T>[] = [
    ...(config.sortable && !search
      ? [{
          key: '__order', header: <span className="sr-only">Ordine</span>, className: 'w-20',
          cell: (r: T) => {
            const i = (data ?? []).findIndex((x) => x.id === r.id)
            return <ReorderButtons label={String(r.name ?? r.label ?? r.question ?? '')} onUp={() => move(i, -1)} onDown={() => move(i, 1)} disabledUp={i === 0} disabledDown={i === (data ?? []).length - 1} />
          },
        }]
      : []),
    ...config.columns,
    {
      key: '__actions', header: <span className="sr-only">Azioni</span>, className: 'w-24 text-right',
      cell: (r: T) => (
        <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label="Modifica" onClick={() => { setError(null); setEditing({ id: r.id, values: { ...r }, original: { ...r } }) }}>
            <Pencil className="h-4 w-4" />
          </button>
          <button type="button" className="rounded-lg p-2 text-ink-500 hover:bg-danger-50 hover:text-danger-600" aria-label="Elimina" onClick={() => void remove(r)}>
            <Trash2 className="h-4 w-4" />
          </button>
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={config.title}
        description={config.description}
        actions={<>{config.actions}<Button icon={<Plus className="h-4 w-4" />} onClick={() => { setError(null); setEditing({ values: { ...config.defaults } }) }}>Nuovo</Button></>}
      />
      {config.searchKeys && (
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca…" className="pl-10" aria-label={`Cerca ${config.title}`} />
        </div>
      )}
      {loading && !data ? (
        <Skeleton className="h-64" />
      ) : (
        <DataTable
          caption={config.title}
          rows={rows}
          columns={columns}
          rowKey={(r) => r.id}
          onRowClick={(r) => { setError(null); setEditing({ id: r.id, values: { ...r }, original: { ...r } }) }}
          empty={<EmptyState title="Nessun elemento" description={search ? 'Nessun risultato per la ricerca.' : `Crea il primo: ${config.singular.toLowerCase()}.`} />}
        />
      )}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Modifica ${config.singular.toLowerCase()}` : `Nuovo ${config.singular.toLowerCase()}`}
        size="lg"
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Annulla</Button><Button loading={saving} onClick={save}>Salva</Button></>}
      >
        {editing && (
          <div className="space-y-4">
            <FieldGrid fields={config.fields} values={editing.values as Record<string, unknown>} onChange={(p) => setEditing({ ...editing, values: { ...editing.values, ...p } })} />
            <FormError message={error} />
          </div>
        )}
      </Modal>
    </div>
  )
}
