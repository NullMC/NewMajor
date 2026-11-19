import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({ gfm: true, breaks: true })

let hooked = false
function ensureHooks() {
  if (hooked) return
  hooked = true
  // Link esterni: nuova scheda e rel sicuro
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') ?? ''
      if (/^https?:\/\//i.test(href)) {
        node.setAttribute('target', '_blank')
        node.setAttribute('rel', 'noopener noreferrer')
      }
    }
  })
}

/** Converte Markdown (inserito dall'admin) in HTML sanificato contro XSS. */
export function renderMarkdown(md: string | null | undefined): string {
  if (!md) return ''
  ensureHooks()
  const html = marked.parse(md, { async: false }) as string
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'input', 'object', 'embed'],
    FORBID_ATTR: ['style', 'onerror', 'onload'],
  })
}

export function stripMarkdown(md: string | null | undefined, max = 160): string {
  if (!md) return ''
  const text = md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/[#>*_`|-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
