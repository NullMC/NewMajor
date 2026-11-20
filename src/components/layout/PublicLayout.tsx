import { Suspense, useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useQuery } from '@/hooks/useQuery'
import { getSiteContent, type SiteBanner } from '@/features/content/api'
import { PageLoader } from '@/components/ui/Spinner'
import { SiteHeader } from './SiteHeader'
import { SiteFooter } from './SiteFooter'
import { CookieBanner } from './CookieBanner'
import { useGlassPointer } from '@/components/fx/LiquidGlass'

export function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }) }, [pathname])
  return null
}

function AnnouncementBar() {
  const { data } = useQuery('content:site.banner', () => getSiteContent<SiteBanner>('site.banner'), { staleMs: 5 * 60_000 })
  if (!data?.enabled || !data.text) return null
  const inner = <span className="font-medium">{data.text}</span>
  return (
    <div className="bg-ink-900 px-4 py-2 text-center text-xs text-white sm:text-sm">
      {data.link?.startsWith('/') ? <Link to={data.link} className="underline-offset-4 hover:underline">{inner}</Link> : inner}
    </div>
  )
}

export function PublicLayout() {
  useGlassPointer()
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[80] focus:rounded-lg focus:bg-ink-900 focus:px-4 focus:py-2 focus:text-white">
        Vai al contenuto
      </a>
      <AnnouncementBar />
      <SiteHeader />
      <main id="main" className="flex-1">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
      <SiteFooter />
      <CookieBanner />
    </div>
  )
}
