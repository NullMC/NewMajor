import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import type { AdminReminder } from '@/types/db'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { Button } from '@/components/ui/Button'
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/Display'
import { Field, FormError, Input, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Overlay'
import { Tabs } from '@/components/ui/Tabs'
import { useUi } from '@/components/ui/Toast'

export default function RemindersPage() {
  useMeta({ title: 'Promemoria', noindex: true })
  const { toast, confirm } = useUi()
  const [tab, setTab] = useState<'open' | 'done'>('open')
  const { data, loading, reload, setData } = useQuery(`admin:reminders:${tab}`, async () => {
    const { data: rows, error } = await supabase
      .from('admin_reminders').select('*,orders(reference)').eq('is_done', tab === 'done')
      .order(tab === 'open' ? 'due_at' : 'done_at', { ascending: tab === 'open', nullsFirst: false }).limit(200)
    if (error) throw error
    return rows as AdminReminder[]
  })
  const [form, setForm] = useState<{ title: string; note: string; due_at: string; reference: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const toggle = async (r: AdminReminder) => {
    setData((d) => (d ?? []).filter((x) => x.id !== r.id))
    const { error: e } = await supabase.from('admin_reminders').update({ is_done: !r.is_done, done_at: r.is_done ? null : new Date().toISOString() }).eq('id', r.id)
    if (e) { toast(errorMessage(e), 'error'); void reload() }
  }

  const remove = async (r: AdminReminder) => {
    if (!(await confirm({ title: 'Eliminare il promemoria?', confirmLabel: 'Elimina', danger: true }))) return
    const { error: e } = await supabase.from('admin_reminders').delete().eq('id', r.id)
    if (e) return toast(errorMessage(e), 'error')
    setData((d) => (d ?? []).filter((x) => x.id !== r.id))
  }

  const create = async () => {
    if (!form) return
    if (!form.title.trim()) return setError('Inserisci un titolo.')
    setSaving(true)
    setError(null)
    try {
      let orderId: string | null = null
      let userId: string | null = null
      if (form.reference.trim()) {
        const { data: o } = await supabase.from('orders').select('id,user_id').eq('reference', form.reference.trim().toUpperCase()).maybeSingle()
        if (!o) throw new Error('Nessun ordine con questo riferimento.')
        orderId = o.id
        userId = o.user_id
      }
      const { data: u } = await supabase.auth.getUser()
      const { error: e } = await supabase.from('admin_reminders').insert({
        title: form.title.trim(), note: form.note.trim() || null, due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
        order_id: orderId, user_id: userId, created_by: u.user?.id,
      })
      if (e) throw e
      setForm(null)
      setTab('open')
      void reload()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const overdue = (r: AdminReminder) => !r.is_done && r.due_at && new Date(r.due_at).getTime() < Date.now()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Promemoria"
        description="Generati automaticamente a ogni nuovo ordine, cambio stato o richiesta di aggiornamento. Puoi crearne anche di manuali."
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => { setError(null); setForm({ title: '', note: '', due_at: '', reference: '' }) }}>Nuovo promemoria</Button>}
      />
      <Tabs ariaLabel="Stato promemoria" value={tab} onChange={setTab} items={[{ value: 'open', label: 'Da fare' }, { value: 'done', label: 'Completati' }]} />
      {loading && !data ? <Skeleton className="h-48" /> : data?.length ? (
        <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200 bg-white">
          {data.map((r) => (
            <li key={r.id} className="flex items-start gap-3 px-5 py-4">
              <input type="checkbox" checked={r.is_done} onChange={() => void toggle(r)} className="mt-0.5 h-5 w-5 shrink-0 accent-ink-900" aria-label={`Segna come ${r.is_done ? 'da fare' : 'completato'}: ${r.title}`} />
              <div className="min-w-0 flex-1">
                <p className={cn('font-medium', r.is_done && 'text-ink-400 line-through')}>{r.title}</p>
                {r.note && <p className="mt-0.5 whitespace-pre-line text-sm text-ink-600">{r.note}</p>}
                <p className={cn('mt-1 text-xs', overdue(r) ? 'font-semibold text-danger-600' : 'text-ink-500')}>
                  {r.is_done ? `Completato ${formatDateTime(r.done_at)}` : r.due_at ? `Scadenza ${formatDateTime(r.due_at)}` : 'Senza scadenza'}
                  {r.order_id && <> · <Link to={`/admin/ordini/${r.order_id}`} className="underline">{r.orders?.reference ?? 'ordine'}</Link></>}
                </p>
              </div>
              <button type="button" onClick={() => void remove(r)} className="rounded-lg p-2 text-ink-400 hover:bg-danger-50 hover:text-danger-600" aria-label="Elimina"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      ) : <EmptyState title={tab === 'open' ? 'Nessun promemoria da fare' : 'Nessun promemoria completato'} />}

      <Modal open={!!form} onClose={() => setForm(null)} title="Nuovo promemoria" footer={<><Button variant="secondary" onClick={() => setForm(null)}>Annulla</Button><Button loading={saving} onClick={() => void create()}>Crea</Button></>}>
        {form && (
          <div className="space-y-4">
            <Field label="Titolo" required><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} /></Field>
            <Field label="Note"><Textarea rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={2000} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Scadenza"><Input type="datetime-local" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} /></Field>
              <Field label="Riferimento ordine" hint="Facoltativo, es. NM26-00012"><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
            </div>
            <FormError message={error} />
          </div>
        )}
      </Modal>
    </div>
  )
}
