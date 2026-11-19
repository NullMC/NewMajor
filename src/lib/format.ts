const priceFmt = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })
const dateFmt = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
})
const rtf = new Intl.RelativeTimeFormat('it-IT', { numeric: 'auto' })

export const formatPrice = (value: number | string | null | undefined) =>
  value === null || value === undefined || value === '' ? '—' : priceFmt.format(Number(value))

export const formatDate = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(iso)) : '—')
export const formatDateTime = (iso: string | null | undefined) => (iso ? dateTimeFmt.format(new Date(iso)) : '—')

export function formatRelative(iso: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000
  const abs = Math.abs(diff)
  if (abs < 60) return 'adesso'
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), 'day')
  return formatDate(iso)
}

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export const PAYMENT_METHOD_LABEL = {
  cash_on_delivery: 'Pagamento alla consegna',
  bank_transfer: 'Bonifico bancario',
} as const

export const PAYMENT_STATUS_LABEL = {
  pending: 'Da pagare alla consegna',
  awaiting_transfer: 'In attesa di bonifico',
  paid: 'Pagato',
  refunded: 'Rimborsato',
} as const

export const ORDER_KIND_LABEL = { order: 'Ordine', quote: 'Preventivo', test: 'Test' } as const

export const AVAILABILITY_LABEL = {
  in_stock: 'Disponibile',
  on_request: 'Su richiesta',
  out_of_stock: 'Non disponibile',
} as const
