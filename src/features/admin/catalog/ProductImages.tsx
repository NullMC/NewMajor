import { useState } from 'react'
import { Replace, Star, Trash2 } from 'lucide-react'
import type { ProductImage, ProductVariant } from '@/types/db'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { optimizeImage, publicUrl, removePublic, uploadPublic, SITE_IMAGE_ACCEPT } from '@/lib/storage'
import { Badge } from '@/components/ui/Display'
import { Dropzone } from '@/components/ui/Dropzone'
import { Input, Select } from '@/components/ui/Form'
import { useUi } from '@/components/ui/Toast'
import { ReorderButtons } from '../components/fields'

/**
 * Gestione immagini prodotto: upload multiplo con ottimizzazione WebP, ordinamento,
 * immagine principale, testo alternativo, sostituzione (il file precedente viene eliminato) e
 * colore associato: nella pagina prodotto, scelto un colore, compaiono prima le sue immagini.
 */
export function ProductImages({ productId, images, variants = [], onChanged }: { productId: string; images: ProductImage[]; variants?: Pick<ProductVariant, 'id' | 'name' | 'color_hex'>[]; onChanged: () => void }) {
  const { toast, confirm } = useUi()
  const [busy, setBusy] = useState(0)
  const [alts, setAlts] = useState<Record<string, string>>({})

  const upload = async (files: File[]) => {
    setBusy(files.length)
    let order = (images.at(-1)?.sort_order ?? 0) + 10
    for (const f of files) {
      try {
        const opt = await optimizeImage(f, 2000)
        const path = await uploadPublic(opt.blob, `products/${productId}`, opt.mime, f.name)
        const isFirst = images.length === 0 && order === 10
        const { error } = await supabase.from('product_images').insert({
          product_id: productId, storage_path: path, width: opt.width || null, height: opt.height || null,
          sort_order: order, is_primary: isFirst, alt: null,
        })
        if (error) throw error
        order += 10
      } catch (e) {
        toast(`${f.name}: ${errorMessage(e)}`, 'error')
      } finally {
        setBusy((n) => n - 1)
      }
    }
    onChanged()
  }

  const replace = async (img: ProductImage, file: File) => {
    try {
      const opt = await optimizeImage(file, 2000)
      const path = await uploadPublic(opt.blob, `products/${productId}`, opt.mime, file.name)
      const { error } = await supabase.from('product_images').update({ storage_path: path, width: opt.width || null, height: opt.height || null }).eq('id', img.id)
      if (error) throw error
      await removePublic([img.storage_path]).catch(() => undefined)
      onChanged()
      toast('Immagine sostituita')
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  const remove = async (img: ProductImage) => {
    if (!(await confirm({ title: 'Eliminare l’immagine?', confirmLabel: 'Elimina', danger: true }))) return
    try {
      const { error } = await supabase.from('product_images').delete().eq('id', img.id)
      if (error) throw error
      await removePublic([img.storage_path]).catch(() => undefined)
      if (img.is_primary) {
        const next = images.find((i) => i.id !== img.id)
        if (next) await supabase.from('product_images').update({ is_primary: true }).eq('id', next.id)
      }
      onChanged()
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  const makePrimary = async (img: ProductImage) => {
    await supabase.from('product_images').update({ is_primary: false }).eq('product_id', productId)
    const { error } = await supabase.from('product_images').update({ is_primary: true }).eq('id', img.id)
    if (error) toast(errorMessage(error), 'error')
    onChanged()
  }

  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= images.length) return
    const a = images[i], b = images[j]
    await Promise.all([
      supabase.from('product_images').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('product_images').update({ sort_order: a.sort_order === b.sort_order ? a.sort_order + dir : a.sort_order }).eq('id', b.id),
    ])
    onChanged()
  }

  const setVariant = async (img: ProductImage, variantId: string) => {
    const { error } = await supabase.from('product_images').update({ variant_id: variantId || null }).eq('id', img.id)
    if (error) toast(errorMessage(error), 'error')
    else onChanged()
  }

  const saveAlt = async (img: ProductImage) => {
    const alt = alts[img.id]
    if (alt === undefined || alt === (img.alt ?? '')) return
    const { error } = await supabase.from('product_images').update({ alt: alt || null }).eq('id', img.id)
    if (error) toast(errorMessage(error), 'error')
    else onChanged()
  }

  return (
    <div className="space-y-4">
      <Dropzone multiple onFiles={upload} disabled={busy > 0} label={busy ? `Caricamento (${busy})…` : 'Trascina qui le immagini del prodotto'} hint="Ottimizzate automaticamente in WebP (lato massimo 2000 px)" />
      {images.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((img, i) => (
            <li key={img.id} className={cn('surface overflow-hidden', img.is_primary && 'ring-2 ring-gold-500')}>
              <div className="relative aspect-[4/5] bg-ink-100">
                <img src={publicUrl(img.storage_path) ?? ''} alt={img.alt ?? ''} className="h-full w-full object-cover" loading="lazy" />
                {img.is_primary && <Badge tone="gold" className="absolute left-2 top-2">Principale</Badge>}
              </div>
              <div className="space-y-2 p-3">
                <Input
                  value={alts[img.id] ?? img.alt ?? ''}
                  onChange={(e) => setAlts({ ...alts, [img.id]: e.target.value })}
                  onBlur={() => void saveAlt(img)}
                  placeholder="Testo alternativo (accessibilità/SEO)"
                  aria-label="Testo alternativo"
                  className="h-9 text-sm"
                  maxLength={200}
                />
                {variants.length > 0 && (
                  <Select
                    value={img.variant_id ?? ''}
                    onChange={(e) => void setVariant(img, e.target.value)}
                    aria-label="Colore dell’immagine"
                    className="h-9 text-sm"
                  >
                    <option value="">Tutti i colori</option>
                    {variants.map((v) => <option key={v.id} value={v.id}>Colore: {v.name}</option>)}
                  </Select>
                )}
                <div className="flex items-center justify-between">
                  <ReorderButtons label={`immagine ${i + 1}`} onUp={() => move(i, -1)} onDown={() => move(i, 1)} disabledUp={i === 0} disabledDown={i === images.length - 1} />
                  <div className="flex">
                    {!img.is_primary && (
                      <button type="button" onClick={() => void makePrimary(img)} className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100" aria-label="Imposta come principale"><Star className="h-4 w-4" /></button>
                    )}
                    <label className="cursor-pointer rounded-lg p-1.5 text-ink-500 hover:bg-ink-100" aria-label="Sostituisci immagine">
                      <Replace className="h-4 w-4" />
                      <input type="file" accept={SITE_IMAGE_ACCEPT} className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void replace(img, f); e.target.value = '' }} />
                    </label>
                    <button type="button" onClick={() => void remove(img)} className="rounded-lg p-1.5 text-ink-500 hover:bg-danger-50 hover:text-danger-600" aria-label="Elimina immagine"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
