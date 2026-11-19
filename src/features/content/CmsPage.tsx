import { useParams } from 'react-router-dom'
import { useQuery } from '@/hooks/useQuery'
import { useMeta } from '@/hooks/useMeta'
import { formatDate } from '@/lib/format'
import { stripMarkdown } from '@/lib/markdown'
import { Markdown, Skeleton } from '@/components/ui/Display'
import { getPage } from './api'
import NotFoundPage from './NotFoundPage'

/** Pagina gestita dal backoffice (Chi siamo, pagine legali, pagine libere). */
export function CmsContent({ slug, fallbackTitle }: { slug: string; fallbackTitle?: string }) {
  const { data: page, loading } = useQuery(`page:${slug}`, () => getPage(slug))
  useMeta({
    title: page?.seo_title || page?.title || fallbackTitle,
    description: page?.seo_description || page?.excerpt || stripMarkdown(page?.content),
    type: 'article',
  })
  if (loading && !page) {
    return (
      <div className="container max-w-3xl space-y-4 py-14">
        <Skeleton className="h-12 w-2/3" /><Skeleton className="h-4" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-4/6" />
      </div>
    )
  }
  if (!page) return <NotFoundPage />
  return (
    <article className="container max-w-3xl py-12 sm:py-16">
      <h1 className="display-lg text-4xl sm:text-5xl">{page.title}</h1>
      {page.kind === 'legal' && <p className="mt-3 text-sm text-ink-500">Ultimo aggiornamento: {formatDate(page.updated_at)}</p>}
      {page.excerpt && page.kind === 'page' && <p className="mt-5 text-lg text-ink-600">{page.excerpt}</p>}
      <Markdown source={page.content} className="mt-10" />
    </article>
  )
}

export default function CmsPage() {
  const { slug = '' } = useParams()
  return <CmsContent slug={slug} />
}
