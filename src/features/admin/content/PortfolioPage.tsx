import type { PortfolioPlatform, PortfolioPost } from '@/types/db'
import { useMeta } from '@/hooks/useMeta'
import { Badge } from '@/components/ui/Display'
import { PLATFORM_LABEL } from '@/features/content/api'
import { ResourceManager } from '../components/ResourceManager'
import { ThumbCell } from '../components/fields'

export default function PortfolioPage() {
  useMeta({ title: 'Portfolio', noindex: true })
  return (
    <ResourceManager<PortfolioPost & Record<string, unknown>>
      config={{
        table: 'portfolio_posts',
        title: 'Portfolio',
        description: 'Post in cui le squadre mostrano divise e kit realizzati. I post pubblicati compaiono nella home, nell’ordine indicato.',
        singular: 'Post',
        sortable: true,
        searchKeys: ['team_name', 'title', 'caption'],
        imageKeys: ['image_path'],
        invalidates: ['portfolio'],
        defaults: { is_published: true },
        fields: [
          { key: 'team_name', label: 'Squadra', type: 'text', required: true },
          { key: 'title', label: 'Titolo', type: 'text', hint: 'Es. il nome del kit o della stagione' },
          { key: 'image_path', label: 'Immagine del post', type: 'image', folder: 'portfolio', required: true, hint: 'Usa immagini che la squadra ha autorizzato a ripubblicare' },
          { key: 'image_alt', label: 'Testo alternativo', type: 'text', span: 2, hint: 'Descrive l’immagine a chi usa un lettore di schermo' },
          { key: 'caption', label: 'Didascalia', type: 'textarea' },
          { key: 'post_url', label: 'Link al post originale', type: 'url' },
          { key: 'platform', label: 'Piattaforma', type: 'select', options: (Object.keys(PLATFORM_LABEL) as PortfolioPlatform[]).map((value) => ({ value, label: PLATFORM_LABEL[value] })) },
          { key: 'posted_on', label: 'Data del post', type: 'date' },
          { key: 'is_published', label: 'Pubblicato', type: 'boolean' },
        ],
        columns: [
          { key: 'img', header: '', className: 'w-14', cell: (r) => <ThumbCell path={r.image_path} /> },
          { key: 'team', header: 'Squadra', cell: (r) => <span className="font-medium">{r.team_name}{r.title && <span className="block text-xs font-normal text-ink-500">{r.title}</span>}</span> },
          { key: 'platform', header: 'Piattaforma', hideBelow: 'sm', cell: (r) => (r.platform ? PLATFORM_LABEL[r.platform] : '—') },
          { key: 'state', header: 'Stato', cell: (r) => (r.is_published ? <Badge tone="success">Pubblicato</Badge> : <Badge>Bozza</Badge>) },
        ],
      }}
    />
  )
}
