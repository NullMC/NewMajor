import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, MessageSquare } from 'lucide-react'
import { formatDate, formatDateTime, formatPrice, ORDER_KIND_LABEL, PAYMENT_METHOD_LABEL } from '@/lib/format'
import { errorMessage } from '@/lib/errors'
import { useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { Badge, Card, CardHeader, EmptyState } from '@/components/ui/Display'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Overlay'
import { Textarea } from '@/components/ui/Form'
import { PageLoader } from '@/components/ui/Spinner'
import { useUi } from '@/components/ui/Toast'
import { useSettings } from '@/features/settings/SettingsProvider'
import { getOrder, listStatuses, requestOrderUpdate } from '@/features/orders/api'
import { AddressBlock, BankTransferInstructions, OrderItemDetails, OrderProgress, PaymentBadge } from '@/features/orders/components'

export default function OrderDetailPage() {
  const { id = '' } = useParams()
  const { settings } = useSettings()
  const { toast } = useUi()
  const { data: order, loading, reload } = useQuery(`orders:${id}`, () => getOrder(id))
  const { data: statuses } = useQuery('order-statuses', listStatuses, { staleMs: 10 * 60_000 })
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  useMeta({ title: order ? `Ordine ${order.reference}` : 'Ordine', noindex: true })

  if (loading && !order) return <PageLoader />
  if (!order) return <EmptyState title="Ordine non trovato" action={<ButtonLink to="/account/ordini">I miei ordini</ButtonLink>} />

  const lastRequest = order.last_update_request_at ? new Date(order.last_update_request_at).getTime() : 0
  const canRequest = Date.now() - lastRequest > 12 * 3600 * 1000 && !order.order_statuses.is_final

  const send = async () => {
    setSending(true)
    try {
      await requestOrderUpdate(order.id, message.trim())
      toast('Richiesta inviata: ti risponderemo al più presto')
      setOpen(false)
      setMessage('')
      void reload()
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <Link to="/account/ordini" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-900"><ArrowLeft className="h-4 w-4" /> Ordini</Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-mono text-2xl font-bold">{order.reference}</h2>
          <p className="text-sm text-ink-500">Effettuato il {formatDateTime(order.created_at)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {order.kind !== 'order' && <Badge tone="dark">{ORDER_KIND_LABEL[order.kind]}</Badge>}
          <PaymentBadge status={order.payment_status} />
        </div>
      </div>

      <Card className="p-5">
        {statuses && <OrderProgress status={order.order_statuses} statuses={statuses} />}
        {!order.order_statuses.is_final && (
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-ink-100 pt-4">
            <Button variant="secondary" size="sm" icon={<MessageSquare className="h-4 w-4" />} disabled={!canRequest} onClick={() => setOpen(true)}>
              Richiedi un aggiornamento
            </Button>
            {!canRequest && lastRequest > 0 && <p className="text-xs text-ink-500">Richiesta inviata il {formatDateTime(order.last_update_request_at)}</p>}
          </div>
        )}
      </Card>

      {order.payment_method === 'bank_transfer' && order.payment_status === 'awaiting_transfer' && (
        <BankTransferInstructions bank={settings.bank_transfer} reference={order.reference} total={order.total} />
      )}

      <Card>
        <CardHeader title="Articoli" />
        <ul className="divide-y divide-ink-100">
          {order.order_items.map((it) => <li key={it.id} className="p-5"><OrderItemDetails item={it} /></li>)}
        </ul>
        <dl className="space-y-2 border-t border-ink-100 p-5 text-sm">
          <div className="flex justify-between"><dt className="text-ink-500">Subtotale</dt><dd>{formatPrice(order.subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-500">Spedizione</dt><dd>{order.shipping_cost === null ? 'Da definire' : formatPrice(order.shipping_cost)}</dd></div>
          <div className="flex justify-between text-base font-semibold"><dt>Totale</dt><dd>{formatPrice(order.total)}</dd></div>
        </dl>
      </Card>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="p-5"><p className="label-caps mb-2">Spedizione</p><AddressBlock a={order.shipping_address} /></Card>
        <Card className="p-5"><p className="label-caps mb-2">Fatturazione</p>{order.billing_address ? <AddressBlock a={order.billing_address} /> : <p className="text-sm text-ink-500">Nessuna fattura richiesta</p>}</Card>
        <Card className="p-5">
          <p className="label-caps mb-2">Pagamento</p>
          <p className="text-sm font-medium">{PAYMENT_METHOD_LABEL[order.payment_method]}</p>
          {order.payment_confirmed_at && <p className="text-sm text-ink-500">Ricevuto il {formatDate(order.payment_confirmed_at)}</p>}
        </Card>
      </div>

      {order.customer_notes && <Card className="p-5"><p className="label-caps mb-2">Le tue note</p><p className="whitespace-pre-line text-sm">{order.customer_notes}</p></Card>}

      <Card>
        <CardHeader title="Storico aggiornamenti" />
        <ol className="space-y-0 p-5">
          {order.order_status_history.map((h, i) => (
            <li key={h.id} className="relative flex gap-4 pb-6 last:pb-0">
              {i < order.order_status_history.length - 1 && <span className="absolute left-[5px] top-4 h-full w-px bg-ink-200" aria-hidden />}
              <span className={`relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ${i === 0 ? 'bg-ink-900' : 'bg-ink-300'}`} aria-hidden />
              <div>
                <p className="text-sm font-semibold">{h.order_statuses?.label}</p>
                {h.note && <p className="text-sm text-ink-600">{h.note}</p>}
                <p className="text-xs text-ink-400">{formatDateTime(h.created_at)}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Richiedi un aggiornamento"
        description="Il nostro staff riceverà la tua richiesta e ti aggiornerà."
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Annulla</Button><Button loading={sending} onClick={send}>Invia richiesta</Button></>}
      >
        <Textarea rows={4} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Messaggio facoltativo" aria-label="Messaggio" />
      </Modal>
    </div>
  )
}
