import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Trash2 } from 'lucide-react'
import type { Page } from '@/types/db'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { invalidate, useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState } from '@/components/ui/Display'
import { FormError } from '@/components/ui/Form'
import { PageLoader } from '@/components/ui/Spinner'
import { useUi } from '@/components/ui/Toast'
import { FieldGrid, validateFields, type FieldDef } from '../components/fields'

const RESERVED = ['catalogo', 'prodotti', 'carrello', 'checkout', 'account', 'admin', 'accedi', 'registrati', 'faq', 'contatti', 'password-dimenticata', 'reimposta-password', 'ordine-confermato']
const SYSTEM = ['chi-siamo', 'termini-e-condizioni', 'privacy-policy', 'cookie-policy', 'politica-rimborsi']

const FIELDS: FieldDef[] = [
  { key: 'title', label: 'Titolo', type: 'text', required: true },
  { key: 'slug', label: 'Slug (indirizzo)', type: 'slug', from: 'title', required: true, hint: 'La pagina sarà visibile su /slug' },
  { key: 'kind', label: 'Tipo', type: 'select', required: true, options: [{ value: 'page', label: 'Pagina' }, { value: 'legal', label: 'Pagina legale (link nel footer)' }] },
  { key: 'sort_order', label: 'Ordine', type: 'number', step: 1 },
  { key: 'is_published', label: 'Pubblicata', type: 'boolean' },
  { key: 'excerpt', label: 'Estratto', type: 'textarea', hint: 'Breve introduzione (facoltativa)' },
  { key: 'content', label: 'Contenuto', type: 'markdown' },
  { key: 'seo_title', label: 'Titolo SEO', type: 'text' },
  { key: 'seo_description', label: 'Meta description', type: 'text' },
]

export default function PageEditPage() {
  const { id = '' } = useParams()
  const isNew = id === 'nuova'
  const navigate = useNavigate()
  const { toast, confirm } = useUi()
  const { data: page, loading } = useQuery(isNew ? null : `admin:page:${id}`, async () => {
    const { data, error } = await supabase.from('pages').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data as Page | null
  })
  const [values, setValues] = useState<Record<string, unknown>>({ title: '', slug: '', kind: 'page', content: '', is_published: false, sort_order: 0 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useMeta({ title: page?.title ?? 'Nuova pagina', noindex: true })

  useEffect(() => { if (page) setValues({ ...page }) }, [page])

  if (!isNew && loading && !page) return <PageLoader />
  if (!isNew && !page) return <EmptyState title="Pagina non trovata" />

  const save = async () => {
    const err = validateFields(FIELDS, values)
    if (err) return setError(err)
    if (RESERVED.includes(String(values.slug))) return setError('Questo slug è riservato a una sezione del sito.')
    if (page && SYSTEM.includes(page.slug) && values.slug !== page.slug) return setError('Lo slug delle pagine di sistema non può essere modificato (sono collegate da menu e checkout).')
    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {}
      for (const f of FIELDS) payload[f.key] = values[f.key] ?? null
      payload.content = payload.content ?? ''
      if (isNew) {
        const { data, error: e } = await supabase.from('pages').insert(payload).select('id').single()
        if (e) throw e
        navigate(`/admin/pagine/${data.id}`, { replace: true })
      } else {
        const { error: e } = await supabase.from('pages').update(payload).eq('id', id)
        if (e) throw e
      }
      invalidate('page:')
      invalidate('pages:')
      invalidate('admin:pages')
      toast('Pagina salvata')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!page) return
    if (SYSTEM.includes(page.slug)) return toast('Le pagine di sistema non possono essere eliminate: puoi metterle in bozza.', 'error')
    if (!(await confirm({ title: 'Eliminare la pagina?', confirmLabel: 'Elimina', danger: true }))) return
    const { error: e } = await supabase.from('pages').update({ deleted_at: new Date().toISOString(), is_published: false }).eq('id', page.id)
    if (e) return toast(errorMessage(e), 'error')
    invalidate('admin:pages')
    invalidate('pages:')
    navigate('/admin/pagine')
  }

  return (
    <div className="space-y-6">
      <Link to="/admin/pagine" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-900"><ArrowLeft className="h-4 w-4" /> Pagine</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{isNew ? 'Nuova pagina' : page?.title}</h1>
        <div className="flex gap-2">
          {page && <a href={`/${page.slug}`} target="_blank" rel="noopener" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3 text-sm font-semibold hover:border-ink-400"><ExternalLink className="h-4 w-4" /> Apri</a>}
          {page && !SYSTEM.includes(page.slug) && <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => void remove()}>Elimina</Button>}
        </div>
      </div>
      {page?.kind === 'legal' && (
        <p className="rounded-xl bg-warning-50 p-4 text-sm text-warning-700">I testi legali iniziali sono una bozza basata sulla piattaforma e sulle policy del negozio Shopify: falli verificare da un consulente prima della pubblicazione definitiva.</p>
      )}
      <Card className="p-5">
        <FieldGrid fields={FIELDS} values={values} onChange={(p) => setValues((v) => ({ ...v, ...p }))} />
        <FormError message={error} />
        <div className="mt-5 flex justify-end"><Button loading={saving} onClick={() => void save()}>Salva</Button></div>
      </Card>
    </div>
  )
}
