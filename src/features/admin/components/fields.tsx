import { useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Eye, ImagePlus, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { slugify } from '@/lib/slug'
import { errorMessage } from '@/lib/errors'
import { optimizeImage, publicUrl, uploadPublic } from '@/lib/storage'
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/Form'
import { Markdown } from '@/components/ui/Markdown'
import { Dropzone } from '@/components/ui/Dropzone'
import { Spinner } from '@/components/ui/Spinner'
import { useUi } from '@/components/ui/Toast'

export type FieldType = 'text' | 'textarea' | 'markdown' | 'number' | 'boolean' | 'select' | 'color' | 'slug' | 'image' | 'tags'

export interface FieldDef {
  key: string
  label: string
  type: FieldType
  required?: boolean
  hint?: ReactNode
  options?: { value: string; label: string }[]
  /** Per slug: campo da cui generarlo automaticamente. */
  from?: string
  /** Per immagini: cartella nel bucket public-media. */
  folder?: string
  span?: 1 | 2
  min?: number
  max?: number
  step?: number
  nullable?: boolean
}

type Values = Record<string, unknown>

export function MarkdownEditor({ value, onChange, rows = 12, id }: { value: string; onChange: (v: string) => void; rows?: number; id?: string }) {
  const [preview, setPreview] = useState(false)
  return (
    <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
      <div className="flex items-center justify-between border-b border-ink-100 bg-ink-50 px-2 py-1.5">
        <div className="flex gap-1 text-xs font-semibold">
          <button type="button" onClick={() => setPreview(false)} className={cn('inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5', !preview ? 'bg-white shadow-sm' : 'text-ink-500')}>
            <Pencil className="h-3.5 w-3.5" /> Scrivi
          </button>
          <button type="button" onClick={() => setPreview(true)} className={cn('inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5', preview ? 'bg-white shadow-sm' : 'text-ink-500')}>
            <Eye className="h-3.5 w-3.5" /> Anteprima
          </button>
        </div>
        <span className="hidden text-2xs text-ink-500 sm:inline">Markdown: **grassetto**, ## Titolo, - elenco, [link](/pagina)</span>
      </div>
      {preview ? (
        <div className="min-h-[12rem] p-4"><Markdown source={value} /></div>
      ) : (
        <textarea id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} className="block w-full resize-y border-0 px-4 py-3 font-mono text-[13px] leading-6 focus:outline-none focus:ring-0" />
      )}
    </div>
  )
}

/** Immagine singola nel bucket pubblico. Il file precedente viene eliminato al salvataggio dal chiamante. */
export function ImageInput({ value, onChange, folder = 'library', label = 'Carica immagine' }: { value: string | null; onChange: (path: string | null) => void; folder?: string; label?: string }) {
  const { toast } = useUi()
  const [busy, setBusy] = useState(false)
  const onFiles = async (files: File[]) => {
    const f = files[0]
    if (!f) return
    setBusy(true)
    try {
      const opt = await optimizeImage(f)
      onChange(await uploadPublic(opt.blob, folder, opt.mime, f.name))
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }
  const url = publicUrl(value)
  return (
    <div className="flex items-center gap-3">
      {url ? (
        <div className="checker relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-ink-200">
          <img src={url} alt="" className="h-full w-full object-contain" />
        </div>
      ) : null}
      <div className="flex-1">
        {busy ? (
          <div className="flex h-20 items-center justify-center rounded-2xl border-2 border-dashed border-ink-200"><Spinner /></div>
        ) : (
          <Dropzone compact onFiles={onFiles} label={url ? 'Sostituisci immagine' : label} hint="PNG, JPG, WebP, SVG · ottimizzata automaticamente" />
        )}
        {url && !busy && (
          <button type="button" onClick={() => onChange(null)} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-danger-600 hover:underline">
            <Trash2 className="h-3 w-3" /> Rimuovi
          </button>
        )}
      </div>
    </div>
  )
}

export function FieldInput({ def, values, onChange, id, ...aria }: {
  def: FieldDef; values: Values; onChange: (patch: Values) => void; id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string; required?: boolean
}) {
  const v = values[def.key]
  const a = { id, 'aria-describedby': aria['aria-describedby'], 'aria-invalid': aria['aria-invalid'] }
  const set = (val: unknown) => onChange({ [def.key]: val })
  switch (def.type) {
    case 'boolean':
      return (
        <div className="flex h-11 items-center gap-3">
          <Switch label={def.label} checked={!!v} onChange={set} />
          <span className="text-sm text-ink-600">{v ? 'Sì' : 'No'}</span>
        </div>
      )
    case 'textarea':
      return <Textarea {...a} rows={3} value={(v as string) ?? ''} onChange={(e) => set(e.target.value)} />
    case 'markdown':
      return <MarkdownEditor id={id} value={(v as string) ?? ''} onChange={set} rows={8} />
    case 'number':
      return (
        <Input
          {...a}
          type="number"
          inputMode="decimal"
          min={def.min}
          max={def.max}
          step={def.step ?? 'any'}
          value={v === null || v === undefined ? '' : String(v)}
          onChange={(e) => set(e.target.value === '' ? (def.nullable ? null : 0) : Number(e.target.value))}
        />
      )
    case 'select':
      return (
        <Select {...a} value={(v as string) ?? ''} onChange={(e) => set(e.target.value || null)}>
          {!def.required && <option value="">—</option>}
          {def.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      )
    case 'color':
      return (
        <div className="flex gap-2">
          <input type="color" value={(v as string) || '#FFFFFF'} onChange={(e) => set(e.target.value.toUpperCase())} className="h-11 w-14 cursor-pointer rounded-xl border border-ink-200 bg-white p-1" aria-label={def.label} />
          <Input {...a} value={(v as string) ?? ''} onChange={(e) => set(e.target.value || null)} placeholder="#RRGGBB" maxLength={7} />
        </div>
      )
    case 'slug':
      return (
        <div className="flex gap-2">
          <Input {...a} value={(v as string) ?? ''} onChange={(e) => set(slugify(e.target.value))} />
          {def.from && (
            <button type="button" className="shrink-0 rounded-xl border border-ink-200 px-3 text-xs font-semibold hover:border-ink-400" onClick={() => set(slugify(String(values[def.from!] ?? '')))}>
              Genera
            </button>
          )}
        </div>
      )
    case 'image':
      return <ImageInput value={(v as string) ?? null} onChange={set} folder={def.folder} />
    case 'tags':
      return (
        <Input
          {...a}
          value={Array.isArray(v) ? (v as string[]).join(', ') : ''}
          onChange={(e) => set(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
          placeholder="Valori separati da virgola"
        />
      )
    default:
      return <Input {...a} value={(v as string) ?? ''} onChange={(e) => set(e.target.value)} />
  }
}

export function FieldGrid({ fields, values, onChange }: { fields: FieldDef[]; values: Values; onChange: (patch: Values) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((f) => (
        <Field key={f.key} label={f.label} hint={f.hint} required={f.required} className={cn((f.span === 2 || ['markdown', 'textarea', 'image'].includes(f.type)) && 'sm:col-span-2')}>
          <FieldInput def={f} values={values} onChange={onChange} />
        </Field>
      ))}
    </div>
  )
}

export function validateFields(fields: FieldDef[], values: Values): string | null {
  for (const f of fields) {
    const v = values[f.key]
    if (f.required && (v === null || v === undefined || v === '')) return `Il campo "${f.label}" è obbligatorio.`
    if (f.type === 'slug' && v && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(v))) return `Slug non valido in "${f.label}".`
    if (f.type === 'color' && v && !/^#[0-9A-Fa-f]{6}$/.test(String(v))) return `Colore non valido in "${f.label}" (usa #RRGGBB).`
  }
  return null
}

export function ReorderButtons({ onUp, onDown, disabledUp, disabledDown, label }: { onUp: () => void; onDown: () => void; disabledUp?: boolean; disabledDown?: boolean; label: string }) {
  return (
    <span className="inline-flex">
      <button type="button" onClick={onUp} disabled={disabledUp} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-900 disabled:opacity-25" aria-label={`Sposta su ${label}`}>
        <ArrowUp className="h-4 w-4" />
      </button>
      <button type="button" onClick={onDown} disabled={disabledDown} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-900 disabled:opacity-25" aria-label={`Sposta giù ${label}`}>
        <ArrowDown className="h-4 w-4" />
      </button>
    </span>
  )
}

export function ThumbCell({ path }: { path: string | null | undefined }) {
  const url = publicUrl(path)
  return url ? (
    <img src={url} alt="" className="h-10 w-10 rounded-lg border border-ink-200 object-cover" loading="lazy" />
  ) : (
    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-100 text-ink-300"><ImagePlus className="h-4 w-4" /></span>
  )
}
