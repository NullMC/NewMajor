// Download per la produzione di una riga d'ordine (solo admin):
// 1. anteprima del prodotto finito (foglio unico con tutte le viste salvate);
// 2. file originali del cliente in un archivio ZIP, con riepilogo di posizioni e misure;
// 3. file di produzione: PDF 1:1 con i pezzi del cartamodello disposti sul rotolo.

import { useEffect, useState } from 'react'
import { AlertTriangle, FileArchive, FileImage, Printer } from 'lucide-react'
import type { OrderItem } from '@/types/db'
import type { AssetRef, Configuration } from '@/types/config'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { slugify } from '@/lib/slug'
import { publicUrl, signedUrl, UPLOADS_BUCKET } from '@/lib/storage'
import { ZONE_LABEL } from '@/lib/patterns/placement'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Overlay'
import { useUi } from '@/components/ui/Toast'
import { previewDisplayUrl } from '@/features/cart/assets'
import { getProductById } from '@/features/catalog/api'
import { DEFAULT_BASE } from '@/features/configurator/useConfigurator'
import type { ProductionPiece } from '@/lib/production/plan'
import type { ProductionSettings } from '@/lib/production/pdf'

const VIEWS = [['front', 'Fronte'], ['back', 'Retro'], ['sleeveLeft', 'Manica sinistra'], ['sleeveRight', 'Manica destra']] as const
const DEFAULT_TEXT = { color: '#FFFFFF', outline: null, font: 'block' as const }

function save(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

async function fetchBytes(bucket: string, path: string): Promise<Uint8Array> {
  const url = bucket === UPLOADS_BUCKET || bucket === 'customer-uploads' ? await signedUrl(bucket, path) : publicUrl(path)
  if (!url) throw new Error(`File non disponibile: ${path}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download non riuscito (${res.status}): ${path}`)
  return new Uint8Array(await res.arrayBuffer())
}

const extOf = (name?: string, mime?: string) =>
  (name?.match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'image/webp': 'webp' } as Record<string, string>)[mime ?? ''] ?? 'bin').toLowerCase()

export function ProductionDownloads({ item, orderRef, index }: { item: OrderItem; orderRef: string; index: number }) {
  const { toast } = useUi()
  const [busy, setBusy] = useState<'preview' | 'zip' | null>(null)
  const [pdfOpen, setPdfOpen] = useState(false)
  const base = `${orderRef}_riga-${index + 1}`
  const config = (item.configuration ?? {}) as Configuration
  const views = VIEWS.filter(([k]) => config.preview?.[k])

  const downloadPreview = async () => {
    setBusy('preview')
    try {
      const imgs = await Promise.all(views.map(async ([k, label]) => {
        const url = await previewDisplayUrl(config.preview?.[k])
        if (!url) return null
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.src = url
        await img.decode()
        return { img, label }
      }))
      const list = imgs.filter(Boolean) as { img: HTMLImageElement; label: string }[]
      if (!list.length) throw new Error('Nessuna anteprima salvata per questo articolo.')
      const cell = 900, pad = 40, head = 110
      const c = document.createElement('canvas')
      c.width = pad + list.length * (cell + pad)
      c.height = head + cell + pad * 2
      const g = c.getContext('2d')!
      g.fillStyle = '#ffffff'
      g.fillRect(0, 0, c.width, c.height)
      g.fillStyle = '#0E0E10'
      g.font = '700 34px Inter, sans-serif'
      g.fillText(`${orderRef} · ${item.product_name}`, pad, 58)
      list.forEach(({ img, label }, i) => {
        const x = pad + i * (cell + pad), y = head
        const s = Math.min(cell / img.naturalWidth, (cell - 40) / img.naturalHeight)
        g.drawImage(img, x + (cell - img.naturalWidth * s) / 2, y + 40, img.naturalWidth * s, img.naturalHeight * s)
        g.fillStyle = '#6B6B73'
        g.font = '600 24px Inter, sans-serif'
        g.fillText(label, x, y + 20)
      })
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
      if (blob) save(blob, `${base}_anteprima.png`)
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setBusy(null)
    }
  }

  const downloadZip = async () => {
    setBusy('zip')
    try {
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      const lines: string[] = [`Ordine ${orderRef} · riga ${index + 1} · ${item.product_name}`, '']
      const rows = (item.order_item_customizations ?? []).filter((c) => c.asset_path)
      for (const [i, c] of rows.entries()) {
        const m = c.asset_meta as Record<string, unknown>
        const zone = (m.zone as keyof typeof ZONE_LABEL | undefined) ?? (c.side ?? 'front')
        const name = `${String(i + 1).padStart(2, '0')}_${slugify(c.area_name)}_${slugify(ZONE_LABEL[zone as keyof typeof ZONE_LABEL] ?? String(zone))}.${extOf(m.name as string, m.mime as string)}`
        zip.file(name, await fetchBytes(c.asset_bucket ?? UPLOADS_BUCKET, c.asset_path!))
        const pos = m.free
          ? ` · larghezza ${m.widthCm} cm · ${Number(m.xCm) === 0 ? 'centrato' : `${Math.abs(Number(m.xCm))} cm a ${Number(m.xCm) > 0 ? 'destra' : 'sinistra'} del centro`} · ${m.yCm} cm ${String(zone).startsWith('sleeve') ? 'dalla sommità della manica' : 'sotto il centro collo'}${Number(m.rotation) ? ` · ruotato ${m.rotation}°` : ''}`
          : ''
        lines.push(`${name}: ${c.area_name} (${ZONE_LABEL[zone as keyof typeof ZONE_LABEL] ?? zone})${pos} · file originale "${m.name ?? ''}"${m.width ? ` ${m.width}×${m.height} px` : ''}${m.effectiveDpi ? ` · ≈${m.effectiveDpi} dpi` : ''}`)
      }
      if (!rows.length) throw new Error('Il cliente non ha caricato file per questo articolo.')
      lines.push('', 'Posizioni misurate guardando il pezzo dall’esterno, dal punto di riferimento del cartamodello.')
      zip.file('riepilogo.txt', lines.join('\r\n'))
      save(await zip.generateAsync({ type: 'blob' }), `${base}_file-cliente.zip`)
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" icon={<FileImage className="h-4 w-4" />} loading={busy === 'preview'} disabled={!views.length} onClick={() => void downloadPreview()}>Anteprima prodotto</Button>
      <Button size="sm" variant="secondary" icon={<FileArchive className="h-4 w-4" />} loading={busy === 'zip'} onClick={() => void downloadZip()}>File del cliente (ZIP)</Button>
      {item.product_id && <Button size="sm" icon={<Printer className="h-4 w-4" />} onClick={() => setPdfOpen(true)}>File di produzione (PDF)</Button>}
      {pdfOpen && <ProductionDialog item={item} orderRef={orderRef} base={base} onClose={() => setPdfOpen(false)} />}
    </div>
  )
}

const SETTINGS_KEY = 'production'

function ProductionDialog({ item, orderRef, base, onClose }: { item: OrderItem; orderRef: string; base: string; onClose: () => void }) {
  const { toast } = useUi()
  const [s, setS] = useState<Record<keyof ProductionSettings, string> & { remember: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<{ warnings: string[]; result?: string } | null>(null)

  // impostazioni salvate (nessun valore inventato: i campi restano vuoti finché l'admin non li compila)
  useEffect(() => {
    void supabase.from('settings').select('value').eq('key', SETTINGS_KEY).maybeSingle().then(({ data }) => {
      const v = (data?.value ?? {}) as Partial<ProductionSettings>
      setS({
        rollWidthMm: v.rollWidthMm ? String(v.rollWidthMm / 10) : '', bleedMm: v.bleedMm != null ? String(v.bleedMm) : '',
        gapMm: v.gapMm != null ? String(v.gapMm) : '', maxPageMm: v.maxPageMm ? String(v.maxPageMm / 1000) : '',
        mirror: v.mirror ? '1' : '', remember: true,
      })
    })
  }, [])

  const generate = async () => {
    if (!s) return
    const num = (x: string) => Number(x.replace(',', '.'))
    const settings: ProductionSettings = { rollWidthMm: num(s.rollWidthMm) * 10, bleedMm: num(s.bleedMm), gapMm: num(s.gapMm), maxPageMm: num(s.maxPageMm) * 1000, mirror: s.mirror === '1' }
    if (!(settings.rollWidthMm > 0 && settings.bleedMm >= 0 && settings.gapMm >= 0 && settings.maxPageMm > 0)) {
      toast('Compila larghezza del rotolo, abbondanza, distanza e lunghezza massima.', 'error')
      return
    }
    setBusy(true)
    setReport(null)
    try {
      if (s.remember) await supabase.from('settings').upsert({ key: SETTINGS_KEY, value: settings, is_public: false })
      const config = item.configuration as Configuration
      const product = await getProductById(item.product_id!)
      if (!product) throw new Error('Prodotto non trovato.')
      const { data: sets, error } = await supabase.from('pattern_sets').select('*, pattern_pieces(*)').eq('product_id', product.id)
      if (error) throw error
      if (!sets?.length) throw new Error('Questo prodotto non ha cartamodelli: caricali nella scheda Cartamodelli del prodotto.')
      // per ogni componente: cartamodello della tipologia scelta se esiste, altrimenti quello generico
      const comps = product.product_type === 'kit' && product.kit_items.length ? product.kit_items.map((k) => k.id as string | null) : [null]
      const pieces: ProductionPiece[] = []
      const referenceSize: Record<string, string | null> = {}
      for (const comp of comps) {
        const mine = sets.filter((x) => (x.kit_item_id ?? null) === comp)
        const set = mine.find((x) => x.garment_type_id && x.garment_type_id === config.garmentTypeId) ?? mine.find((x) => !x.garment_type_id)
        if (!set) continue
        referenceSize[comp ?? 'main'] = set.reference_size
        for (const p of set.pattern_pieces as ProductionPiece[]) pieces.push({ ...p, kitItemId: comp })
      }
      const variant = product.product_variants.find((v) => v.id === config.variantId)
      const baseColor = variant?.color_hex ?? config.baseColor ?? DEFAULT_BASE
      const [{ buildPlan }, { buildProductionPdf }] = await Promise.all([import('@/lib/production/plan'), import('@/lib/production/pdf')])
      const plan = buildPlan({
        product, config, pieces, referenceSize, baseColor, secondaryColor: variant?.secondary_hex ?? null,
        textStyle: config.textStyle ?? DEFAULT_TEXT, bleedMm: settings.bleedMm,
      })
      if (!plan.jobs.length) throw new Error(plan.warnings[0] ?? 'Nessun pezzo da stampare.')
      const pdf = await buildProductionPdf(plan.jobs, settings, {
        orderRef, productName: item.product_name, colorName: variant?.name ?? null, baseColor, secondaryColor: variant?.secondary_hex ?? null,
        notes: config.customDescription ?? null, roster: config.roster ?? [], warnings: plan.warnings,
      }, config.textStyle ?? DEFAULT_TEXT, (a: AssetRef) => fetchBytes(a.bucket, a.path!))
      save(new Blob([pdf.bytes as BlobPart], { type: 'application/pdf' }), `${base}_produzione.pdf`)
      setReport({
        warnings: [...plan.warnings, ...(pdf.tooWide.length ? [`${pdf.tooWide.length} pezzi sono più larghi del rotolo e non sono stati disposti.`] : [])],
        result: `${pdf.pieces} pezzi su ${pdf.pages} ${pdf.pages === 1 ? 'pagina' : 'pagine'} · circa ${(pdf.lengthMm / 1000).toFixed(2).replace('.', ',')} m di rotolo.`,
      })
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  const set = (k: keyof ProductionSettings) => (e: React.ChangeEvent<HTMLInputElement>) => s && setS({ ...s, [k]: e.target.value })
  return (
    <Modal open onClose={onClose} size="lg" title="File di produzione" description="PDF in scala reale con i pezzi del cartamodello di ogni giocatore, nella sua taglia, disposti sul rotolo."
      footer={<><Button variant="ghost" onClick={onClose}>Chiudi</Button><Button loading={busy} disabled={!s} icon={<Printer className="h-4 w-4" />} onClick={() => void generate()}>Genera PDF</Button></>}>
      {!s ? null : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Larghezza utile del rotolo (cm)"><Input inputMode="decimal" value={s.rollWidthMm} onChange={set('rollWidthMm')} /></Field>
            <Field label="Abbondanza oltre il taglio (mm)"><Input inputMode="decimal" value={s.bleedMm} onChange={set('bleedMm')} /></Field>
            <Field label="Distanza tra i pezzi (mm)"><Input inputMode="decimal" value={s.gapMm} onChange={set('gapMm')} /></Field>
            <Field label="Lunghezza massima per pagina (m)" hint="Oltre questa lunghezza il rotolo prosegue su una nuova pagina."><Input inputMode="decimal" value={s.maxPageMm} onChange={set('maxPageMm')} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-ink-900" checked={s.mirror === '1'} onChange={(e) => setS({ ...s, mirror: e.target.checked ? '1' : '' })} /> Specchia le pagine per la stampa su carta transfer (se il RIP non lo fa)</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-ink-900" checked={s.remember} onChange={(e) => setS({ ...s, remember: e.target.checked })} /> Ricorda queste impostazioni</label>
          <p className="text-xs text-ink-500">
            Ogni pezzo ha la linea di taglio sul colore spot “CutContour” e un’etichetta sotto il pezzo, sul tessuto di scarto. Stampa sempre al 100%.
          </p>
          {report?.result && <p className="rounded-xl bg-success-50 p-3 text-sm text-success-700">PDF scaricato: {report.result}</p>}
          {report?.warnings.map((w) => <p key={w} className="flex gap-2 rounded-xl bg-warning-50 p-3 text-sm text-warning-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{w}</p>)}
        </div>
      )}
    </Modal>
  )
}
