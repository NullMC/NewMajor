import { supabase } from '@/lib/supabase'
import type { Product, ProductDetail } from '@/types/db'

const ADMIN_DETAIL =
  '*,categories(id,name,slug),product_images(*),product_variants(*),' +
  'product_options(*,product_option_values(*)),customization_areas(*),kit_items!kit_items_kit_id_fkey(*),price_tiers(*),' +
  'product_garment_types(garment_type_id,price_delta,sort_order,garment_types(*))'

const bySort = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order

export async function adminListProducts(archived = false): Promise<Product[]> {
  let q = supabase
    .from('products')
    .select('id,name,slug,base_price,availability,supply_mode,is_published,is_configurable,product_type,sort_order,category_id,deleted_at,updated_at,created_at,categories(id,name,slug),product_images(storage_path,is_primary,sort_order)')
  q = archived ? q.not('deleted_at', 'is', null) : q.is('deleted_at', null)
  const { data, error } = await q.order('sort_order').order('name')
  if (error) throw error
  return data as unknown as Product[]
}

export async function adminGetProduct(id: string): Promise<ProductDetail | null> {
  const { data, error } = await supabase.from('products').select(ADMIN_DETAIL).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) return null
  const p = data as unknown as ProductDetail
  return {
    ...p,
    product_images: [...(p.product_images ?? [])].sort(bySort),
    product_variants: [...(p.product_variants ?? [])].sort(bySort),
    product_options: [...(p.product_options ?? [])].sort(bySort).map((o) => ({ ...o, product_option_values: [...(o.product_option_values ?? [])].sort(bySort) })),
    customization_areas: [...(p.customization_areas ?? [])].sort(bySort),
    kit_items: [...(p.kit_items ?? [])].sort(bySort),
    price_tiers: [...(p.price_tiers ?? [])].sort((a, b) => a.min_quantity - b.min_quantity),
    product_garment_types: [...(p.product_garment_types ?? [])].sort(bySort),
  }
}

export async function isFeatured(id: string) {
  const { data } = await supabase.from('featured_products').select('product_id').eq('product_id', id).maybeSingle()
  return !!data
}
