import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/format'
import type { ConfiguratorApi } from '../useConfigurator'

const delta = (n: number | null | undefined) => (n && Number(n) !== 0 ? `${Number(n) > 0 ? '+' : ''}${formatPrice(n)}` : null)

export function GarmentSection({ api }: { api: ConfiguratorApi }) {
  const items = api.product.product_garment_types ?? []
  if (!items.length) return null
  return (
    <div role="radiogroup" aria-label="Tipologia capo" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((g) => {
        if (!g.garment_types) return null
        const active = api.config.garmentTypeId === g.garment_type_id
        const d = delta(g.price_delta ?? g.garment_types.price_delta)
        return (
          <button
            key={g.garment_type_id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => api.patch({ garmentTypeId: g.garment_type_id })}
            className={cn(
              'relative rounded-xl border px-3 py-3 text-left transition-colors',
              active ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white hover:border-ink-400',
            )}
          >
            <span className="block text-sm font-semibold">{g.garment_types.name}</span>
            {g.garment_types.brand && g.garment_types.brand !== g.garment_types.name && (
              <span className={cn('block text-xs', active ? 'text-white/70' : 'text-ink-500')}>{g.garment_types.brand}</span>
            )}
            {d && <span className={cn('mt-1 block text-xs font-medium', active ? 'text-gold-300' : 'text-ink-600')}>{d}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function ColorSection({ api }: { api: ConfiguratorApi }) {
  const variants = api.product.product_variants.filter((v) => v.is_active)
  if (!variants.length) return null
  const current = variants.find((v) => v.id === api.config.variantId)
  return (
    <div>
      <div role="radiogroup" aria-label="Colore base" className="flex flex-wrap gap-2.5">
        {variants.map((v) => {
          const active = v.id === api.config.variantId
          return (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${v.name}${delta(v.price_delta) ? ` (${delta(v.price_delta)})` : ''}`}
              title={v.name}
              onClick={() => api.patch({ variantId: v.id })}
              className={cn(
                'relative h-11 w-11 overflow-hidden rounded-full border-2 transition-transform hover:scale-105',
                active ? 'border-ink-900 ring-2 ring-white ring-offset-2 ring-offset-ink-900' : 'border-ink-200',
              )}
              style={{ background: v.secondary_hex ? `linear-gradient(135deg, ${v.color_hex} 0 60%, ${v.secondary_hex} 60% 100%)` : v.color_hex }}
            >
              {active && <Check className="absolute inset-0 m-auto h-4 w-4 text-white mix-blend-difference" aria-hidden />}
            </button>
          )
        })}
      </div>
      {current && (
        <p className="mt-3 text-sm text-ink-600">
          <span className="font-medium text-ink-900">{current.name}</span>
          {delta(current.price_delta) && <span className="ml-2">{delta(current.price_delta)}</span>}
        </p>
      )}
    </div>
  )
}

export function OptionsSection({ api }: { api: ConfiguratorApi }) {
  const options = api.product.product_options.filter((o) => (o.product_option_values ?? []).length)
  if (!options.length) return null
  return (
    <div className="space-y-5">
      {options.map((o) => (
        <fieldset key={o.id}>
          <legend className="text-sm font-semibold text-ink-900">
            {o.name}{o.is_required && <span className="ml-0.5 text-danger-600" aria-hidden>*</span>}
          </legend>
          {o.help_text && <p className="mt-0.5 text-xs text-ink-500">{o.help_text}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {(o.product_option_values ?? []).map((v) => {
              const active = api.config.optionValueIds.includes(v.id)
              return (
                <button
                  key={v.id}
                  type="button"
                  role={o.is_multiple ? 'checkbox' : 'radio'}
                  aria-checked={active}
                  onClick={() => api.toggleOption(o.id, v.id, o.is_multiple)}
                  className={cn(
                    'inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors',
                    active ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white hover:border-ink-400',
                  )}
                >
                  {v.color_hex && <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: v.color_hex }} aria-hidden />}
                  {v.label}
                  {delta(v.price_delta) && <span className={cn('text-xs', active ? 'text-gold-300' : 'text-ink-500')}>{delta(v.price_delta)}</span>}
                </button>
              )
            })}
          </div>
        </fieldset>
      ))}
    </div>
  )
}

const TEXT_COLORS = ['#FFFFFF', '#0E0E10', '#C2A063', '#B42318', '#1D4ED8', '#15803D', '#F59E0B']

export function TextStyleSection({ api }: { api: ConfiguratorApi }) {
  const style = api.config.textStyle!
  const hasText = api.product.customization_areas.some(
    (a) => (a.area_type === 'text' || a.area_type === 'number') && api.config.areas[a.id]?.enabled,
  )
  if (!hasText) return null
  return (
    <div className="space-y-4 rounded-2xl border border-ink-200 bg-white p-4">
      <p className="text-sm font-semibold">Stile di nomi e numeri</p>
      <div>
        <p className="text-xs font-medium text-ink-600">Colore</p>
        <div className="mt-2 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Colore testo">
          {TEXT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={style.color === c}
              aria-label={c}
              onClick={() => api.setTextStyle({ color: c })}
              className={cn('h-9 w-9 rounded-full border-2', style.color === c ? 'border-ink-900 ring-2 ring-white ring-offset-2 ring-offset-ink-900' : 'border-ink-200')}
              style={{ background: c }}
            />
          ))}
          <label className="inline-flex h-9 items-center gap-2 rounded-xl border border-ink-200 px-2 text-xs font-medium">
            Altro
            <input type="color" value={style.color} onChange={(e) => api.setTextStyle({ color: e.target.value.toUpperCase() })} className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0" />
          </label>
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-5 w-5 accent-ink-900"
            checked={!!style.outline}
            onChange={(e) => api.setTextStyle({ outline: e.target.checked ? (style.color === '#0E0E10' ? '#FFFFFF' : '#0E0E10') : null })}
          />
          Contorno
        </label>
        {style.outline && (
          <label className="flex items-center gap-2 text-sm">
            Colore contorno
            <input type="color" value={style.outline} onChange={(e) => api.setTextStyle({ outline: e.target.value.toUpperCase() })} className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0" />
          </label>
        )}
        <div className="flex rounded-xl bg-ink-100 p-0.5 text-xs font-semibold" role="radiogroup" aria-label="Carattere">
          {(['block', 'classic'] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={style.font === f}
              onClick={() => api.setTextStyle({ font: f })}
              className={cn('h-8 rounded-lg px-3', style.font === f ? 'bg-ink-900 text-white' : 'text-ink-600')}
            >
              {f === 'block' ? 'Sport' : 'Classico'}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
