import { useEffect, useState } from 'react'
import { Download, ImageOff, Landmark, Copy } from 'lucide-react'
import type { AddressSnapshot, Order, OrderItem, OrderStatus, ProductDetail, BankTransferSettings } from '@/types/db'
import type { Configuration } from '@/types/config'
import { cn } from '@/lib/cn'
import { formatPrice, PAYMENT_STATUS_LABEL } from '@/lib/format'
import { downloadUrl, signedUrl, UPLOADS_BUCKET } from '@/lib/storage'
import { Badge, ProgressBar } from '@/components/ui/Display'
import { useUi } from '@/components/ui/Toast'
import { previewDisplayUrl } from '@/features/cart/assets'

// Stato e avanzamento ----------------------------------------------------------------

export function StatusBadge({ status }: { status?: Pick<OrderStatus, 'label' | 'is_cancelled' | 'is_final'> | null }) {
  if (!status) return null
  const tone = status.is_cancelled ? 'danger' : status.is_final ? 'success' : 'gold'
  return <Badge tone={tone}>{status.label}</Badge>
}

export function PaymentBadge({ status }: { status: Order['payment_status'] }) {
  const tone = status === 'paid' ? 'success' : status === 'awaiting_transfer' ? 'warning' : status === 'refunded' ? 'neutral' : 'neutral'
  return <Badge tone={tone}>{PAYMENT_STATUS_LABEL[status]}</Badge>
}

/** Barra di avanzamento: riflette lo stato impostato manualmente dall'admin. */
export function OrderProgress({ status, statuses }: { status: OrderStatus; statuses: OrderStatus[] }) {
  const steps = statuses.filter((s) => s.is_active && !s.is_cancelled).sort((a, b) => a.sort_order - b.sort_order)
  if (status.is_cancelled) {
    return (
      <div>
        <ProgressBar value={100} tone="danger" label="Ordine annullato" />
        <p className="mt-2 text-sm font-medium text-danger-700">{status.label}</p>
      </div>
    )
  }
  const currentIndex = steps.findIndex((s) => s.id === status.id)
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold">{status.label}</p>
        <p className="text-sm text-ink-500">{status.progress}%</p>
      </div>
      <ProgressBar value={status.progress} label={`Avanzamento ordine: ${status.label}`} className="mt-2" />
      {status.description && <p className="mt-2 text-sm text-ink-500">{status.description}</p>}
      <ol className="no-scrollbar mt-5 flex gap-1 overflow-x-auto" aria-label="Fasi dell'ordine">
        {steps.map((s, i) => (
          <li key={s.id} className="min-w-[5.5rem] flex-1">
            <div className={cn('h-1 rounded-full', i <= currentIndex ? 'bg-ink-900' : 'bg-ink-200')} />
            <p className={cn('mt-1.5 text-2xs leading-tight', i === currentIndex ? 'font-semibold text-ink-900' : i < currentIndex ? 'text-ink-600' : 'text-ink-400')}>
              {s.label}
            </p>
          </li>
        ))}
      </ol>
    </div>
  )
}

// Indirizzi ----------------------------------------------------------------------

export function AddressBlock({ a }: { a: AddressSnapshot | null | undefined }) {
  if (!a) return <p className="text-sm text-ink-500">—</p>
  return (
    <address className="text-sm not-italic leading-6 text-ink-700">
      <span className="font-medium text-ink-900">{a.full_name}</span><br />
      {a.company && <>{a.company}<br /></>}
      {a.line1}{a.line2 ? `, ${a.line2}` : ''}<br />
      {a.postal_code} {a.city}{a.province ? ` (${a.province})` : ''} — {a.country}
      {a.phone && <><br />{a.phone}</>}
      {a.vat_number && <><br />P. IVA {a.vat_number}</>}
      {a.fiscal_code && <><br />C.F. {a.fiscal_code}</>}
    </address>
  )
}

// Bonifico -------------------------------------------------------------------------

export function BankTransferInstructions({ bank, reference, total }: { bank: BankTransferSettings; reference: string; total: number }) {
  const { toast } = useUi()
  const copy = (v: string) => navigator.clipboard?.writeText(v).then(() => toast('Copiato'))
  const configured = !!bank.iban
  return (
    <div className="rounded-2xl border border-gold-300 bg-gold-100/50 p-5">
      <p className="flex items-center gap-2 font-semibold"><Landmark className="h-5 w-5 text-gold-700" aria-hidden /> Istruzioni per il bonifico</p>
      {configured ? (
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <Row label="Intestatario" value={bank.account_holder} />
          <Row label="IBAN" value={bank.iban} onCopy={() => copy(bank.iban.replace(/\s/g, ''))} mono />
          {bank.bank_name && <Row label="Banca" value={bank.bank_name} />}
          {bank.bic && <Row label="BIC/SWIFT" value={bank.bic} mono />}
          <Row label="Causale" value={`Ordine ${reference}`} onCopy={() => copy(`Ordine ${reference}`)} />
          <Row label="Importo" value={formatPrice(total)} />
        </dl>
      ) : (
        <p className="mt-3 text-sm text-ink-700">Le coordinate bancarie ti verranno comunicate alla conferma dell’ordine.</p>
      )}
      {bank.instructions && <p className="mt-4 text-sm text-ink-600">{bank.instructions}</p>}
    </div>
  )
}

function Row({ label, value, onCopy, mono }: { label: string; value: string; onCopy?: () => void; mono?: boolean }) {
  return (
    <div>
      <dt className="text-ink-500">{label}</dt>
      <dd className="mt-0.5 flex items-center gap-2 font-medium text-ink-900">
        <span className={cn('break-all', mono && 'font-mono text-[13px]')}>{value || '—'}</span>
        {onCopy && value && (
          <button type="button" onClick={onCopy} className="rounded p-1 text-ink-500 hover:bg-white hover:text-ink-900" aria-label={`Copia ${label}`}>
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </dd>
    </div>
  )
}

/** Zona e, per loghi/sponsor liberi, misure e posizione in cm. */
function placementText(side: string | null, m: Record<string, unknown>) {
  const zones: Record<string, string> = { front: 'Fronte', back: 'Retro', sleeve_left: 'Manica sinistra', sleeve_right: 'Manica destra' }
  const zone = (m.zone as string) ?? side ?? 'front'
  if (!m.free) return zones[zone] ?? zone
  const x = Number(m.xCm), y = Number(m.yCm)
  const fmt = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',')
  return `${zones[zone] ?? zone} · ${fmt(Number(m.widthCm))} cm di larghezza · ${x === 0 ? 'centrato' : `${fmt(Math.abs(x))} cm a ${x > 0 ? 'destra' : 'sinistra'}`} · ${fmt(y)} cm ${zone.startsWith('sleeve') ? 'dalla spalla' : 'sotto il collo'}${Number(m.rotation) ? ` · ${m.rotation}°` : ''}`
}

// Anteprime -----------------------------------------------------------------------

export function PreviewThumbs({ preview, className, size = 'md' }: { preview?: Configuration['preview']; className?: string; size?: 'sm' | 'md' }) {
  const [urls, setUrls] = useState<{ front?: string | null; back?: string | null; sleeveLeft?: string | null; sleeveRight?: string | null }>({})
  useEffect(() => {
    let cancelled = false
    Promise.all([previewDisplayUrl(preview?.front), previewDisplayUrl(preview?.back), previewDisplayUrl(preview?.sleeveLeft), previewDisplayUrl(preview?.sleeveRight)]).then(([front, back, sleeveLeft, sleeveRight]) => {
      if (!cancelled) setUrls({ front, back, sleeveLeft, sleeveRight })
    })
    return () => { cancelled = true }
  }, [preview?.front, preview?.back, preview?.sleeveLeft, preview?.sleeveRight])
  const box = size === 'sm' ? 'h-16 w-16' : 'h-24 w-24'
  if (!preview?.front && !preview?.back) {
    return <div className={cn('flex items-center justify-center rounded-xl bg-ink-100 text-ink-300', box, className)}><ImageOff className="h-5 w-5" aria-hidden /></div>
  }
  return (
    <div className={cn('flex gap-1.5', className)}>
      {(['front', 'back', 'sleeveLeft', 'sleeveRight'] as const).map((s) => urls[s] ? (
        <a key={s} href={urls[s]!} target="_blank" rel="noopener noreferrer" className={cn('overflow-hidden rounded-xl bg-ink-100 p-1', box)} aria-label={`Anteprima ${({ front: 'fronte', back: 'retro', sleeveLeft: 'manica sinistra', sleeveRight: 'manica destra' } as const)[s]}`}>
          <img src={urls[s]!} alt="" className="h-full w-full object-contain" loading="lazy" />
        </a>
      ) : null)}
    </div>
  )
}

// Riepilogo configurazione -------------------------------------------------------------

/** Righe leggibili della configurazione (per carrello e checkout). */
export function describeConfiguration(product: ProductDetail | undefined, config: Configuration) {
  const out: { label: string; value: string }[] = []
  if (!product) return out
  const gt = product.product_garment_types?.find((g) => g.garment_type_id === config.garmentTypeId)?.garment_types
  if (gt) out.push({ label: 'Tipologia', value: gt.name })
  const variant = product.product_variants.find((v) => v.id === config.variantId)
  if (variant) out.push({ label: 'Colore', value: variant.name })
  for (const o of product.product_options) {
    const vals = (o.product_option_values ?? []).filter((v) => config.optionValueIds.includes(v.id))
    if (vals.length) out.push({ label: o.name, value: vals.map((v) => v.label).join(', ') })
  }
  const areas = product.customization_areas.filter((a) => config.areas[a.id]?.enabled)
  if (areas.length) out.push({ label: 'Personalizzazioni', value: areas.map((a) => a.name).join(', ') })
  if (config.roster.length) {
    const sizes = new Map<string, number>()
    for (const r of config.roster) {
      const k = r.size ?? (r.sizes ? Object.values(r.sizes).join('/') : '')
      if (k) sizes.set(k, (sizes.get(k) ?? 0) + r.quantity)
    }
    if (sizes.size) out.push({ label: 'Taglie', value: [...sizes].map(([s, n]) => `${s}×${n}`).join(' · ') })
  }
  return out
}

/** Dettaglio completo di una riga ordine: personalizzazioni con file, roster. */
export function OrderItemDetails({ item, showFiles = false, actions }: { item: OrderItem; showFiles?: boolean; actions?: React.ReactNode }) {
  const customizations = item.order_item_customizations ?? []
  const roster = item.order_item_roster ?? []
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <PreviewThumbs preview={item.configuration?.preview} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{item.product_name}</p>
          {item.supply_mode === 'on_demand' && (
            <span className="mt-1 inline-flex rounded-full bg-gold-100 px-2.5 py-0.5 text-xs font-semibold text-gold-800">
              {showFiles ? 'Print-on-demand · da ordinare al fornitore' : 'Print-on-demand'}
            </span>
          )}
          <p className="text-sm text-ink-500">{item.quantity} × {formatPrice(item.unit_price)} = <span className="font-semibold text-ink-900">{formatPrice(item.line_total)}</span></p>
          {item.configuration?.customDescription && <p className="mt-2 rounded-lg bg-ink-50 p-2 text-sm text-ink-700">{item.configuration.customDescription}</p>}
        </div>
      </div>
      {actions}
      {customizations.length > 0 && (
        <div>
          <p className="label-caps">Personalizzazioni</p>
          <ul className="mt-2 divide-y divide-ink-100 rounded-xl border border-ink-200">
            {customizations.map((c) => <CustomizationRow key={c.id} c={c} showFiles={showFiles} />)}
          </ul>
        </div>
      )}
      {roster.length > 0 && (
        <div>
          <p className="label-caps">Nomi, numeri e taglie</p>
          <div className="mt-2 overflow-x-auto rounded-xl border border-ink-200">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-left text-2xs uppercase tracking-wider text-ink-500">
                <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Nome</th><th className="px-3 py-2">Numero</th><th className="px-3 py-2">Taglia</th><th className="px-3 py-2 text-right">Qtà</th></tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {roster.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-ink-400">{r.position + 1}</td>
                    <td className="px-3 py-2 font-medium">{r.player_name ?? '—'}</td>
                    <td className="px-3 py-2">{r.player_number ?? '—'}</td>
                    <td className="px-3 py-2">{r.size ?? (Object.values(r.sizes ?? {}).join(' / ') || '—')}</td>
                    <td className="px-3 py-2 text-right">{r.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function CustomizationRow({ c, showFiles }: { c: NonNullable<OrderItem['order_item_customizations']>[number]; showFiles: boolean }) {
  const [thumb, setThumb] = useState<string | null>(null)
  useEffect(() => {
    if (c.asset_path && c.asset_bucket) void signedUrl(c.asset_bucket, c.asset_path).then(setThumb)
  }, [c.asset_path, c.asset_bucket])
  const meta = c.asset_meta as { name?: string; width?: number; height?: number; effectiveDpi?: number | null; quality?: string; acknowledgedLowQuality?: boolean; isVector?: boolean }
  const download = async () => {
    if (!c.asset_path) return
    const url = await downloadUrl(c.asset_bucket ?? UPLOADS_BUCKET, c.asset_path)
    if (url) window.open(url, '_blank', 'noopener')
  }
  return (
    <li className="flex items-center gap-3 p-3">
      {c.asset_path ? (
        <div className="checker flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ink-200">
          {thumb && <img src={thumb} alt="" className="max-h-full max-w-full object-contain" />}
        </div>
      ) : null}
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">{c.area_name} <span className="font-normal text-ink-500">· {placementText(c.side, c.asset_meta as Record<string, unknown>)}</span></p>
        {c.asset_path && (
          <p className="truncate text-xs text-ink-500">
            {meta.name}{meta.isVector ? ' · vettoriale' : meta.width ? ` · ${meta.width}×${meta.height} px` : ''}
            {meta.effectiveDpi ? ` · ≈${meta.effectiveDpi} dpi` : ''}
          </p>
        )}
        {(meta.quality === 'warn' || meta.quality === 'poor') && (
          <p className="text-xs font-medium text-warning-700">Qualità {meta.quality === 'poor' ? 'insufficiente' : 'limitata'}{meta.acknowledgedLowQuality ? ' — accettata dal cliente' : ''}</p>
        )}
        {typeof (c.asset_meta as { note?: string }).note === 'string' && <p className="text-xs text-ink-500">{(c.asset_meta as { note?: string }).note}</p>}
      </div>
      {showFiles && c.asset_path && (
        <button type="button" onClick={download} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 px-3 text-xs font-semibold hover:border-ink-900">
          <Download className="h-3.5 w-3.5" /> Originale
        </button>
      )}
    </li>
  )
}
