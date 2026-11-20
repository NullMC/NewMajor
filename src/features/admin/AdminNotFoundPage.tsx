import { useMeta } from '@/hooks/useMeta'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Display'

/** Indirizzo del backoffice inesistente: resta dentro il layout admin invece dell'errore del router. */
export default function AdminNotFoundPage() {
  useMeta({ title: 'Sezione non trovata', noindex: true })
  return (
    <EmptyState
      title="Sezione non trovata"
      description="Questa sezione del backoffice non esiste o è stata spostata. Se hai appena aggiornato il sito, ricarica la pagina."
      action={<ButtonLink to="/admin">Torna alla dashboard</ButtonLink>}
    />
  )
}
