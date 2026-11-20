import { supabase } from '@/lib/supabase'
import type { Faq, Page, PortfolioPlatform, PortfolioPost } from '@/types/db'

export interface HeroContent {
  title: string
  subtitle: string
  cta_primary?: { label: string; href: string }
  cta_secondary?: { label: string; href: string }
  image_path?: string | null
}

export interface HomeSections {
  personalization?: { title: string; text: string; points: string[] }
  process?: { title: string; steps: { title: string; text: string }[] }
  portfolio?: { title: string; text: string }
  catalog_cta?: { title: string; text: string }
  contact_cta?: { title: string; text: string }
}

export interface SiteBanner { enabled: boolean; text: string; link?: string }

export async function getSiteContent<T>(key: string): Promise<T | null> {
  const { data, error } = await supabase.from('site_content').select('value').eq('key', key).maybeSingle()
  if (error) throw error
  return (data?.value as T) ?? null
}

export async function getSiteContents(keys: string[]): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.from('site_content').select('key,value').in('key', keys)
  if (error) throw error
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))
}

export async function getPage(slug: string): Promise<Page | null> {
  const { data, error } = await supabase.from('pages').select('*').eq('slug', slug).is('deleted_at', null).maybeSingle()
  if (error) throw error
  return data as Page | null
}

export async function listLegalPages(): Promise<Pick<Page, 'slug' | 'title'>[]> {
  const { data, error } = await supabase
    .from('pages')
    .select('slug,title')
    .eq('kind', 'legal')
    .eq('is_published', true)
    .is('deleted_at', null)
    .order('sort_order')
  if (error) throw error
  return data as Pick<Page, 'slug' | 'title'>[]
}

export async function listFaqs(): Promise<Faq[]> {
  const { data, error } = await supabase.from('faqs').select('*').eq('is_active', true).order('sort_order')
  if (error) throw error
  return data as Faq[]
}

export const PLATFORM_LABEL: Record<PortfolioPlatform, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', altro: 'Altro' }

export async function listPortfolio(): Promise<PortfolioPost[]> {
  const { data, error } = await supabase.from('portfolio_posts').select('*').eq('is_published', true).order('sort_order').order('created_at', { ascending: false })
  if (error) throw error
  return data as PortfolioPost[]
}

export async function sendContactRequest(input: {
  name: string; email: string; phone?: string; subject?: string; message: string; user_id?: string | null
}) {
  const { error } = await supabase.from('contact_requests').insert({
    name: input.name.trim(),
    email: input.email.trim(),
    phone: input.phone?.trim() || null,
    subject: input.subject?.trim() || null,
    message: input.message.trim(),
    user_id: input.user_id ?? null,
  })
  if (error) throw error
}
