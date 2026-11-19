import { CmsContent } from './CmsPage'

/** "Chi siamo": contenuto interamente gestito dal backoffice (pagina con slug chi-siamo). */
export default function AboutPage() {
  return <CmsContent slug="chi-siamo" fallbackTitle="Chi siamo" />
}
