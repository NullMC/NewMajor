// Genera public/sitemap.xml leggendo da Supabase prodotti, categorie e pagine pubblicati.
// Uso: npm run sitemap  (richiede VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY (o VITE_SUPABASE_ANON_KEY) e VITE_SITE_URL in .env)
import fs from 'node:fs'
import path from 'node:path'

function loadEnv() {
  const env = { ...process.env }
  for (const file of ['.env', '.env.local', '.env.production']) {
    if (!fs.existsSync(file)) continue
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !(m[1] in process.env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
  return env
}

const env = loadEnv()
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY
const site = (env.VITE_SITE_URL || '').replace(/\/$/, '')
if (!url || !key || !site) {
  console.error('Imposta VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY e VITE_SITE_URL.')
  process.exit(1)
}

async function get(table, query) {
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`)
  return res.json()
}

const [products, categories, pages] = await Promise.all([
  get('products', 'select=slug,updated_at&is_published=eq.true&deleted_at=is.null'),
  get('categories', 'select=slug,updated_at&is_active=eq.true&deleted_at=is.null'),
  get('pages', 'select=slug,updated_at&is_published=eq.true&deleted_at=is.null'),
])

const entries = [
  { loc: '/', priority: '1.0' },
  { loc: '/catalogo', priority: '0.9' },
  { loc: '/faq', priority: '0.5' },
  { loc: '/contatti', priority: '0.5' },
  ...categories.map((c) => ({ loc: `/catalogo/${c.slug}`, lastmod: c.updated_at, priority: '0.8' })),
  ...products.map((p) => ({ loc: `/prodotti/${p.slug}`, lastmod: p.updated_at, priority: '0.8' })),
  ...pages.map((p) => ({ loc: `/${p.slug}`, lastmod: p.updated_at, priority: '0.4' })),
]

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => `  <url><loc>${esc(site + e.loc)}</loc>${e.lastmod ? `<lastmod>${e.lastmod.slice(0, 10)}</lastmod>` : ''}<priority>${e.priority}</priority></url>`).join('\n')}
</urlset>
`
fs.writeFileSync(path.join('public', 'sitemap.xml'), xml)
fs.writeFileSync(path.join('public', 'robots.txt'), `User-agent: *
Disallow: /admin
Disallow: /account
Disallow: /checkout
Disallow: /carrello
Sitemap: ${site}/sitemap.xml
`)
console.log(`sitemap.xml generata con ${entries.length} URL`)
