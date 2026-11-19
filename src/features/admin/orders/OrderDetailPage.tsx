import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Bell, CheckCircle2, Mail, Phone, Send } from 'lucide-react'
import type { AdminReminder, OrderInternalNote, PaymentStatus } from '@/types/db'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { formatDateTime, formatPrice, ORDER_KIND_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from '@/lib/format'
import { invalidate, useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { Badge, Card, CardHeader, EmptyState } from '@/components/ui/Display'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Form'
import { PageLoader } from '@/components/ui/Spinner'
import { useUi } from '@/components/ui/Toast'
import { getOrder, listStatuses } from '@/features/orders/api'
import { AddressBlock, OrderItemDetails, OrderProgress, PaymentBadge } from '@/features/orders/components'

const tel = (n: string) => `tel:${n.replace(/[^\d+]/g, '')}`

export default function OrderDetailPage() {
  const { id = '' } = useParams()
  const { toast } = useUi()
  const { data: order, loading, reload } = useQuery(`admin:order:${id}`, () => getOrder(id))
  const { data: statuses } = useQuery('order-statuses', listStatuses)
  const { data: notes, reload: reloadNotes } = useQuery(`admin:order-notes:${id}`, async () => {
    const { data, error } = await supabase.from('order_internal_notes').select('*,profiles:author_id(full_name,email)').eq('order_id', id).order('created_at', { ascending: false })
    if (error) throw error
    return data as OrderInternalNote[]
  })
  const { data: reminders, reload: reloadReminders } = useQuery(`admin:order-reminders:${id}`, async () => {
    const { data, error } = await supabase.from('admin_reminders').select('*').eq('order_id', id).order('created_at', { ascending: false })
    if (error) throw error
    return data as AdminReminder[]
  })
  useMeta({ title: order ? `Ordine ${order.reference}` : 'Ordine', noindex: true })

  const [statusId, setStatusId] = useState('')
  const [statusNote, setStatusNote] = useState('')
  const [notify, setNotify] = useState(true)
  const [createReminder, setCreateReminder] = useState(true)
  const [savingStatus, setSavingStatus] = useState(false)
  const [note, setNote] = useState('')
  const [shipping, setShipping] = useState('')
  const [msg, setMsg] = useState({ title: '', message: '' })

  useEffect(() => {
    if (order) {
      setStatusId(order.status_id)
      setShipping(order.shipping_cost === null ? '' : String(order.shipping_cost))
    }
  }, [order])

  if (loading && !order) return <PageLoader />
  if (!order) return <EmptyState title="Ordine non trovato" />

  const after = () => { invalidate('admin:orders'); invalidate(`orders:${id}`); void reload() }

  const changeStatus = async () => {
    setSavingStatus(true)
    try {
      const { error } = await supabase.rpc('admin_set_order_status', {
        p_order: order.id, p_status: statusId, p_note: statusNote || null, p_notify: notify, p_create_reminder: createReminder,
      })
      if (error) throw error
      setStatusNote('')
      toast(notify ? 'Stato aggiornato e cliente notificato' : 'Stato aggiornato')
      after()
      void reloadReminders()
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setSavingStatus(false)
    }
  }

  const setPayment = async (status: PaymentStatus) => {
    const { error } = await supabase.rpc('admin_set_payment_status', { p_order: order.id, p_status: status, p_notify: true })
    if (error) return toast(errorMessage(error), 'error')
    toast('Pagamento aggiornato')
    after()
  }

  const saveShipping = async () => {
    const value = shipping === '' ? null : Number(shipping)
    if (value !== null && (Number.isNaN(value) || value < 0)) return toast('Importo non valido', 'error')
    const { error } = await supabase.from('orders').update({ shipping_cost: value, total: Number(order.subtotal) + (value ?? 0) }).eq('id', order.id)
    if (error) return toast(errorMessage(error), 'error')
    toast('Spedizione aggiornata')
    after()
  }

  const addNote = async () => {
    if (!note.trim()) return
    const { data: u } = await supabase.auth.getUser()
    const { error } = await supabase.from('order_internal_notes').insert({ order_id: order.id, body: note.trim(), author_id: u.user?.id })
    if (error) return toast(errorMessage(error), 'error')
    setNote('')
    void reloadNotes()
  }

  const toggleReminder = async (r: AdminReminder) => {
    const { error } = await supabase.from('admin_reminders').update({ is_done: !r.is_done, done_at: r.is_done ? null : new Date().toISOString() }).eq('id', r.id)
    if (error) return toast(errorMessage(error), 'error')
    void reloadReminders()
  }

  const sendMessage = async () => {
    if (!order.user_id || !msg.title.trim() || !msg.message.trim()) return
    const { error } = await supabase.rpc('admin_send_notification', {
      p_user_ids: [order.user_id], p_type: 'admin_message', p_title: msg.title.trim(), p_message: msg.message.trim(), p_link: `/account/ordini/${order.id}`,
    })
    if (error) return toast(errorMessage(error), 'error')
    setMsg({ title: '', message: '' })
    toast('Messaggio inviato al cliente')
  }

  const current = statuses?.find((s) => s.id === order.status_id) ?? order.order_statuses

  return (
    <div className="space-y-6">
      <Link to="/admin/ordini" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-900"><ArrowLeft className="h-4 w-4" /> Ordini</Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-mono text-2xl font-bold">{order.reference}</h1>
          <p className="text-sm text-ink-500">Creato il {formatDateTime(order.created_at)} · aggiornato il {formatDateTime(order.updated_at)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {order.kind !== 'order' && <Badge tone="dark">{ORDER_KIND_LABEL[order.kind]}</Badge>}
          <PaymentBadge status={order.payment_status} />
          {order.last_update_request_at && <Badge tone="warning">Aggiornamento richiesto {formatDateTime(order.last_update_request_at)}</Badge>}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <Card className="p-5">{current && statuses && <OrderProgress status={current} statuses={statuses} />}</Card>

          <Card>
            <CardHeader title={`Articoli (${order.order_items.length})`} />
            <ul className="divide-y divide-ink-100">
              {order.order_items.map((it) => <li key={it.id} className="p-5"><OrderItemDetails item={it} showFiles /></li>)}
            </ul>
            <dl className="space-y-2 border-t border-ink-100 p-5 text-sm">
              <div className="flex justify-between"><dt className="text-ink-500">Subtotale</dt><dd>{formatPrice(order.subtotal)}</dd></div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <dt className="text-ink-500">Spedizione</dt>
                <dd className="flex items-center gap-2">
                  <Input type="number" step="0.01" min={0} value={shipping} onChange={(e) => setShipping(e.target.value)} placeholder="Da definire" className="h-9 w-28 text-sm" aria-label="Costo spedizione" />
                  <Button size="sm" variant="secondary" onClick={() => void saveShipping()}>Salva</Button>
                </dd>
              </div>
              <div className="flex justify-between text-base font-semibold"><dt>Totale</dt><dd>{formatPrice(order.total)}</dd></div>
            </dl>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="p-5"><p className="label-caps mb-2">Spedizione</p><AddressBlock a={order.shipping_address} /></Card>
            <Card className="p-5"><p className="label-caps mb-2">Fatturazione</p>{order.billing_address ? <AddressBlock a={order.billing_address} /> : <p className="text-sm text-ink-500">Nessuna fattura richiesta</p>}</Card>
          </div>
          {order.customer_notes && <Card className="p-5"><p className="label-caps mb-2">Note del cliente</p><p className="whitespace-pre-line text-sm">{order.customer_notes}</p></Card>}

          <Card>
            <CardHeader title="Storico stati" />
            <ol className="divide-y divide-ink-100">
              {order.order_status_history.map((h) => (
                <li key={h.id} className="flex justify-between gap-4 px-5 py-3 text-sm">
                  <div><p className="font-medium">{h.order_statuses?.label}</p>{h.note && <p className="text-ink-600">{h.note}</p>}</div>
                  <span className="shrink-0 text-xs text-ink-500">{formatDateTime(h.created_at)}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Cliente" />
            <div className="space-y-2 p-5 text-sm">
              <p className="font-semibold">{order.customer_name}</p>
              {order.customer_phone && <a href={tel(order.customer_phone)} className="flex items-center gap-2 hover:underline"><Phone className="h-4 w-4 text-ink-400" />{order.customer_phone}</a>}
              {order.customer_email && <a href={`mailto:${order.customer_email}`} className="flex items-center gap-2 break-all hover:underline"><Mail className="h-4 w-4 text-ink-400" />{order.customer_email}</a>}
              {order.user_id && <Link to={`/admin/utenti/${order.user_id}`} className="inline-block pt-1 font-semibold underline underline-offset-4">Scheda utente</Link>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Aggiorna stato" description="Aggiorna la barra di avanzamento del cliente." />
            <div className="space-y-4 p-5">
              <Field label="Nuovo stato">
                <Select value={statusId} onChange={(e) => setStatusId(e.target.value)}>
                  {(statuses ?? []).filter((s) => s.is_active || s.id === order.status_id).map((s) => <option key={s.id} value={s.id}>{s.label} ({s.progress}%)</option>)}
                </Select>
              </Field>
              <Field label="Messaggio per il cliente" hint="Facoltativo: compare nella notifica e nello storico">
                <Textarea rows={3} value={statusNote} onChange={(e) => setStatusNote(e.target.value)} maxLength={2000} />
              </Field>
              <Checkbox label="Invia notifica al cliente" checked={notify} onChange={(e) => setNotify(e.target.checked)} disabled={!order.user_id} />
              <Checkbox label="Crea promemoria per contattare il cliente" checked={createReminder} onChange={(e) => setCreateReminder(e.target.checked)} />
              <Button className="w-full" loading={savingStatus} onClick={() => void changeStatus()} disabled={statusId === order.status_id && !statusNote}>Aggiorna stato</Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Pagamento" description={PAYMENT_METHOD_LABEL[order.payment_method]} />
            <div className="space-y-3 p-5 text-sm">
              <p>Stato: <strong>{PAYMENT_STATUS_LABEL[order.payment_status]}</strong>{order.payment_confirmed_at && ` · ${formatDateTime(order.payment_confirmed_at)}`}</p>
              <div className="flex flex-wrap gap-2">
                {order.payment_status !== 'paid' && <Button size="sm" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => void setPayment('paid')}>Conferma pagamento ricevuto</Button>}
                {order.payment_status === 'paid' && <Button size="sm" variant="secondary" onClick={() => void setPayment(order.payment_method === 'bank_transfer' ? 'awaiting_transfer' : 'pending')}>Annulla conferma</Button>}
                {order.payment_status === 'paid' && <Button size="sm" variant="ghost" onClick={() => void setPayment('refunded')}>Segna rimborsato</Button>}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Promemoria" />
            <ul className="divide-y divide-ink-100">
              {(reminders ?? []).map((r) => (
                <li key={r.id} className="flex items-start gap-3 px-5 py-3 text-sm">
                  <input type="checkbox" checked={r.is_done} onChange={() => void toggleReminder(r)} className="mt-0.5 h-5 w-5 accent-ink-900" aria-label={`Completato: ${r.title}`} />
                  <div className={r.is_done ? 'text-ink-400 line-through' : ''}>
                    <p className="font-medium">{r.title}</p>
                    {r.note && <p className="text-ink-600">{r.note}</p>}
                    <p className="text-xs text-ink-400">{formatDateTime(r.created_at)}</p>
                  </div>
                </li>
              ))}
              {!reminders?.length && <li className="px-5 py-3 text-sm text-ink-500">Nessun promemoria.</li>}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Note interne" description="Visibili solo allo staff." />
            <div className="space-y-3 p-5">
              <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} aria-label="Nuova nota interna" placeholder="Aggiungi una nota…" />
              <Button size="sm" variant="secondary" onClick={() => void addNote()} disabled={!note.trim()}>Aggiungi nota</Button>
              <ul className="space-y-3">
                {(notes ?? []).map((n) => (
                  <li key={n.id} className="rounded-xl bg-ink-50 p-3 text-sm">
                    <p className="whitespace-pre-line">{n.body}</p>
                    <p className="mt-1 text-xs text-ink-400">{n.profiles?.full_name ?? n.profiles?.email ?? 'Staff'} · {formatDateTime(n.created_at)}</p>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          {order.user_id && (
            <Card>
              <CardHeader title="Messaggio al cliente" description="Notifica interna collegata a questo ordine." />
              <div className="space-y-3 p-5">
                <Input placeholder="Titolo" value={msg.title} onChange={(e) => setMsg({ ...msg, title: e.target.value })} maxLength={160} aria-label="Titolo messaggio" />
                <Textarea rows={3} placeholder="Messaggio" value={msg.message} onChange={(e) => setMsg({ ...msg, message: e.target.value })} maxLength={4000} aria-label="Testo messaggio" />
                <Button size="sm" icon={<Send className="h-4 w-4" />} onClick={() => void sendMessage()} disabled={!msg.title.trim() || !msg.message.trim()}>Invia</Button>
                <p className="flex items-center gap-1.5 text-xs text-ink-500"><Bell className="h-3.5 w-3.5" /> Il cliente la vedrà nell’area personale.</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
