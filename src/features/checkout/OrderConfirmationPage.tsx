import { useParams } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { formatPrice, PAYMENT_METHOD_LABEL } from '@/lib/format'
import { useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Display'
import { PageLoader } from '@/components/ui/Spinner'
import { useSettings } from '@/features/settings/SettingsProvider'
import { getOrder } from '@/features/orders/api'
import { BankTransferInstructions } from '@/features/orders/components'
import { useAuth } from '@/features/auth/AuthProvider'

export default function OrderConfirmationPage() {
  const { id = '' } = useParams()
  const { settings } = useSettings()
  const { isAdmin } = useAuth()
  const ordersPath = isAdmin ? '/admin/ordini' : '/account/ordini'
  const { data: order, loading } = useQuery(`orders:${id}`, () => getOrder(id))
  useMeta({ title: 'Ordine ricevuto', noindex: true })

  if (loading && !order) return <PageLoader />
  if (!order) return <div className="container py-16"><EmptyState title="Ordine non trovato" action={<ButtonLink to={ordersPath}>I miei ordini</ButtonLink>} /></div>

  return (
    <div className="container max-w-2xl py-12 sm:py-16">
      <div className="text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-success-600" aria-hidden />
        <h1 className="display-lg mt-5 text-3xl sm:text-4xl">Ordine ricevuto</h1>
        <p className="mt-3 text-ink-600">Grazie! Il riferimento del tuo ordine è</p>
        <p className="mt-2 font-mono text-2xl font-bold tracking-wide">{order.reference}</p>
      </div>

      <div className="surface mt-10 space-y-3 p-6 text-sm">
        <div className="flex justify-between"><span className="text-ink-500">Metodo di pagamento</span><span className="font-medium">{PAYMENT_METHOD_LABEL[order.payment_method]}</span></div>
        <div className="flex justify-between"><span className="text-ink-500">Subtotale</span><span>{formatPrice(order.subtotal)}</span></div>
        <div className="flex justify-between"><span className="text-ink-500">Spedizione</span><span>{order.shipping_cost === null ? 'Da definire' : formatPrice(order.shipping_cost)}</span></div>
        <div className="flex justify-between border-t border-ink-200 pt-3 text-base font-semibold"><span>Totale</span><span>{formatPrice(order.total)}</span></div>
        {order.shipping_cost === null && <p className="text-xs text-ink-500">{settings.shipping.note || 'Il costo di spedizione ti verrà comunicato alla conferma dell’ordine.'}</p>}
      </div>

      {order.payment_method === 'bank_transfer' && (
        <div className="mt-6">
          <BankTransferInstructions bank={settings.bank_transfer} reference={order.reference} total={order.total} />
        </div>
      )}

      <p className="mt-8 text-center text-sm text-ink-600">
        Verificheremo la configurazione e le grafiche e ti aggiorneremo nella tua area personale a ogni cambio di stato.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <ButtonLink to={`${ordersPath}/${order.id}`}>Segui l’ordine</ButtonLink>
        <ButtonLink to="/catalogo" variant="secondary">Continua gli acquisti</ButtonLink>
      </div>
    </div>
  )
}
