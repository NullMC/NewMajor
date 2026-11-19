import { useMeta } from '@/hooks/useMeta'
import { ButtonLink } from '@/components/ui/Button'

export default function NotFoundPage() {
  useMeta({ title: 'Pagina non trovata', noindex: true })
  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <p className="font-display text-8xl font-extrabold text-ink-200" style={{ fontStretch: '120%' }}>404</p>
      <h1 className="mt-4 text-2xl font-bold">Pagina non trovata</h1>
      <p className="mt-2 text-ink-500">La pagina che cerchi non esiste o è stata spostata.</p>
      <div className="mt-8 flex gap-3">
        <ButtonLink to="/">Torna alla home</ButtonLink>
        <ButtonLink to="/catalogo" variant="secondary">Catalogo</ButtonLink>
      </div>
    </div>
  )
}
