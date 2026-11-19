import { cn } from '@/lib/cn'
import { renderMarkdown } from '@/lib/markdown'

/** Contenuto Markdown sanificato (testi inseriti dall'admin). */
export function Markdown({ source, className }: { source: string | null | undefined; className?: string }) {
  return <div className={cn('prose-nm', className)} dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }} />
}
