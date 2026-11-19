import { useEffect } from 'react'

const SITE = 'New Major'
const DEFAULT_DESC =
  'New Major: personalizzazione professionale di divise, abbigliamento e kit da gara sportivi. Configura il tuo kit con anteprima 3D.'
const SITE_URL = (import.meta.env.VITE_SITE_URL || '').replace(/\/$/, '')

function setMeta(attr: 'name' | 'property', key: string, value: string | null) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (value === null) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', value)
}

function setCanonical(path: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.rel = 'canonical'
    document.head.appendChild(el)
  }
  el.href = `${SITE_URL || window.location.origin}${path}`
}

interface MetaOptions {
  title?: string
  description?: string | null
  image?: string | null
  type?: 'website' | 'product' | 'article'
  noindex?: boolean
  /** Dati strutturati JSON-LD */
  jsonLd?: Record<string, unknown> | null
}

/** Titolo, meta description, Open Graph, canonical e JSON-LD per pagina. */
export function useMeta({ title, description, image, type = 'website', noindex, jsonLd }: MetaOptions) {
  const ld = jsonLd ? JSON.stringify(jsonLd) : null
  useEffect(() => {
    const fullTitle = title ? `${title} — ${SITE}` : `${SITE} — Divise e kit da gara personalizzati`
    const desc = description || DEFAULT_DESC
    document.title = fullTitle
    setMeta('name', 'description', desc)
    setMeta('property', 'og:title', fullTitle)
    setMeta('property', 'og:description', desc)
    setMeta('property', 'og:type', type)
    setMeta('property', 'og:url', `${SITE_URL || window.location.origin}${window.location.pathname}`)
    setMeta('property', 'og:image', image || `${SITE_URL || window.location.origin}/brand/logo.png`)
    setMeta('name', 'robots', noindex ? 'noindex,nofollow' : null)
    setCanonical(window.location.pathname)

    let script: HTMLScriptElement | null = null
    if (ld) {
      script = document.createElement('script')
      script.type = 'application/ld+json'
      script.textContent = ld
      document.head.appendChild(script)
    }
    return () => { script?.remove() }
  }, [title, description, image, type, noindex, ld])
}
