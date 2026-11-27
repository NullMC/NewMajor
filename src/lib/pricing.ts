// Calcolo prezzi lato client: rispecchia public.compute_unit_price / compute_line_total.
// È solo indicativo: al checkout il database ricalcola tutto.

import type { Configuration } from '@/types/config'
import type { PrintTechnique, ProductDetail } from '@/types/db'
import { elementPrice, findZone, TECHNIQUE_LABEL } from './printing'

export function configQuantity(config: Configuration, fallback = 1): number {
  if (config.roster?.length) return config.roster.reduce((sum, r) => sum + Math.max(1, Number(r.quantity) || 1), 0)
  return Math.max(1, fallback)
}

export interface PriceBreakdown {
  base: number
  lines: { label: string; amount: number }[]
  unit: number
  quantity: number
  discountPercent: number
  total: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function computePrice(product: ProductDetail, config: Configuration, fallbackQty = 1, techniques: PrintTechnique[] = []): PriceBreakdown {
  const lines: PriceBreakdown['lines'] = []
  const base = Number(product.base_price)

  const gt = product.product_garment_types?.find((g) => g.garment_type_id === config.garmentTypeId)
  if (gt?.garment_types) {
    const delta = Number(gt.price_delta ?? gt.garment_types.price_delta ?? 0)
    if (delta) lines.push({ label: gt.garment_types.name, amount: delta })
  }

  const variant = product.product_variants.find((v) => v.id === config.variantId)
  if (variant && Number(variant.price_delta)) lines.push({ label: variant.name, amount: Number(variant.price_delta) })

  for (const opt of product.product_options) {
    for (const val of opt.product_option_values ?? []) {
      if (config.optionValueIds.includes(val.id) && Number(val.price_delta)) {
        lines.push({ label: `${opt.name}: ${val.label}`, amount: Number(val.price_delta) })
      }
    }
  }

  for (const area of product.customization_areas) {
    if (config.areas[area.id]?.enabled && Number(area.price_delta)) {
      lines.push({ label: area.name, amount: Number(area.price_delta) })
    }
  }

  const all = config.elements ?? []
  // aree di stampa con tecnica: prezzo in base all'area, raggruppato per tecnica
  const byTech = new Map<string, { n: number; amount: number }>()
  for (const e of all) {
    if (!e.technique) continue
    const z = findZone(product.print_zones ?? [], e.zone, e.kitItemId)
    const t = techniques.find((x) => x.code === e.technique)
    if (!z || !t) continue
    const cur = byTech.get(e.technique) ?? { n: 0, amount: 0 }
    byTech.set(e.technique, { n: cur.n + 1, amount: cur.amount + elementPrice(e, z, t) })
  }
  for (const [code, v] of byTech) {
    if (v.amount) lines.push({ label: `${TECHNIQUE_LABEL[code as keyof typeof TECHNIQUE_LABEL]} (${v.n} ${v.n === 1 ? 'area' : 'aree'})`, amount: round2(v.amount) })
  }
  // loghi e sponsor liberi delle versioni precedenti (senza tecnica)
  const els = all.filter((e) => !e.technique)
  const logos = els.filter((e) => e.kind === 'logo').length
  const sponsors = els.filter((e) => e.kind === 'sponsor').length
  if (logos && Number(product.free_logo_price)) lines.push({ label: logos === 1 ? 'Logo aggiuntivo' : `${logos} loghi aggiuntivi`, amount: logos * Number(product.free_logo_price) })
  if (sponsors && Number(product.free_sponsor_price)) lines.push({ label: sponsors === 1 ? 'Sponsor aggiuntivo' : `${sponsors} sponsor aggiuntivi`, amount: sponsors * Number(product.free_sponsor_price) })

  const allOver = config.allOver?.length ?? 0
  if (allOver && Number(product.all_over_price)) {
    lines.push({ label: allOver === 1 ? 'Grafica all-over' : `Grafica all-over (${allOver} capi del kit)`, amount: allOver * Number(product.all_over_price) })
  }

  // fasce su maniche o pantaloncino
  for (const b of config.bands ?? []) {
    const k = b.kitItemId ? product.kit_items.find((x) => x.id === b.kitItemId) : null
    const p = Number(k ? k.band_price ?? 0 : product.band_price ?? 0)
    if (p) lines.push({ label: `Fascia${k ? ` (${k.label})` : ''}`, amount: p })
  }

  const unit = round2(base + lines.reduce((s, l) => s + l.amount, 0))
  const quantity = configQuantity(config, fallbackQty)
  const discountPercent = product.price_tiers
    .filter((t) => t.min_quantity <= quantity)
    .reduce((max, t) => Math.max(max, Number(t.discount_percent)), 0)
  const total = round2(unit * quantity * (1 - discountPercent / 100))
  return { base, lines, unit, quantity, discountPercent, total }
}

/** Prossimo scaglione di sconto raggiungibile. */
export function nextTier(product: ProductDetail, quantity: number) {
  return [...product.price_tiers]
    .sort((a, b) => a.min_quantity - b.min_quantity)
    .find((t) => t.min_quantity > quantity)
}
