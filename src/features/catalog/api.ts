import { supabase } from '@/lib/supabase'
import type { ZonePiece } from '@/lib/patterns/placement'
import type {
  Availability, Category, CustomizationAsset, GarmentType, Product, ProductDetail, ProductType, SupplyMode,
} from '@/types/db'

const LIST_SELECT =
  'id,name,slug,short_description,product_type,base_price,availability,supply_mode,is_configurable,model_shape,min_quantity,attributes,sort_order,category_id,created_at,updated_at,' +
  'categories(id,name,slug),product_images(id,storage_path,alt,is_primary,sort_order,width,height)'

const DETAIL_SELECT =
  '*,categories(id,name,slug),product_images(*),product_variants(*),' +
  'product_options(*,product_option_values(*)),customization_areas(*),kit_items!kit_items_kit_id_fkey(*),price_tiers(*),' +
  'product_garment_types(garment_type_id,price_delta,sort_order,garment_types(*)),print_zones(*)'

const bySort = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order

/** Ordina le relazioni annidate e filtra i record non attivi. */
export function normalizeDetail(p: ProductDetail): ProductDetail {
  return {
    ...p,
    product_images: [...(p.product_images ?? [])].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order),
    product_variants: [...(p.product_variants ?? [])].sort(bySort),
    product_options: [...(p.product_options ?? [])].sort(bySort).map((o) => ({
      ...o,
      product_option_values: [...(o.product_option_values ?? [])].filter((v) => v.is_active).sort(bySort),
    })),
    customization_areas: [...(p.customization_areas ?? [])].sort(bySort),
    kit_items: [...(p.kit_items ?? [])].sort(bySort),
    price_tiers: [...(p.price_tiers ?? [])].sort((a, b) => a.min_quantity - b.min_quantity),
    print_zones: [...(p.print_zones ?? [])].sort(bySort),
    product_garment_types: [...(p.product_garment_types ?? [])]
      .filter((g) => g.garment_types?.is_active !== false)
      .sort(bySort),
  }
}

export function primaryImage(p: Pick<Product, 'product_images'>) {
  const imgs = p.product_images ?? []
  return imgs.find((i) => i.is_primary) ?? [...imgs].sort(bySort)[0] ?? null
}

export async function listCategories(): Promise<Category[]> {
  const { data, error } = await supabase.from('categories').select('*').is('deleted_at', null).order('sort_order').order('name')
  if (error) throw error
  return data as Category[]
}

export async function listGarmentTypes(): Promise<GarmentType[]> {
  const { data, error } = await supabase.from('garment_types').select('*').order('sort_order').order('name')
  if (error) throw error
  return data as GarmentType[]
}

export interface ProductFilters {
  categoryIds?: string[]
  search?: string
  garmentTypeId?: string
  availability?: Availability
  /** Sezione principale del catalogo. */
  supplyMode?: SupplyMode
  productType?: ProductType
  attributes?: Record<string, string>
  sort?: 'default' | 'price_asc' | 'price_desc' | 'newest' | 'name'
}


const cleanSearch = (q: string) => q.replace(/[,()%*\\]/g, ' ').trim().slice(0, 80)

export async function listProducts(f: ProductFilters = {}): Promise<Product[]> {
  const select = f.garmentTypeId ? `${LIST_SELECT},product_garment_types!inner(garment_type_id)` : LIST_SELECT
  let q = supabase.from('products').select(select).eq('is_published', true).is('deleted_at', null)
  if (f.categoryIds?.length) q = q.in('category_id', f.categoryIds)
  if (f.garmentTypeId) q = q.eq('product_garment_types.garment_type_id', f.garmentTypeId)
  if (f.availability) q = q.eq('availability', f.availability)
  if (f.supplyMode) q = q.eq('supply_mode', f.supplyMode)
  if (f.productType) q = q.eq('product_type', f.productType)
  if (f.attributes && Object.keys(f.attributes).length) q = q.contains('attributes', f.attributes)
  const s = f.search ? cleanSearch(f.search) : ''
  if (s) q = q.or(`name.ilike.%${s}%,short_description.ilike.%${s}%`)
  switch (f.sort) {
    case 'price_asc': q = q.order('base_price', { ascending: true }); break
    case 'price_desc': q = q.order('base_price', { ascending: false }); break
    case 'newest': q = q.order('created_at', { ascending: false }); break
    case 'name': q = q.order('name'); break
    default: q = q.order('sort_order').order('name')
  }
  const { data, error } = await q.limit(200)
  if (error) throw error
  return data as unknown as Product[]
}

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  const { data, error } = await supabase.from('products').select(DETAIL_SELECT).eq('slug', slug).is('deleted_at', null).maybeSingle()
  if (error) throw error
  return data ? normalizeDetail(data as unknown as ProductDetail) : null
}

export async function getProductById(id: string): Promise<ProductDetail | null> {
  const { data, error } = await supabase.from('products').select(DETAIL_SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? normalizeDetail(data as unknown as ProductDetail) : null
}

export async function getProductsByIds(ids: string[]): Promise<ProductDetail[]> {
  if (!ids.length) return []
  const { data, error } = await supabase.from('products').select(DETAIL_SELECT).in('id', ids)
  if (error) throw error
  return (data as unknown as ProductDetail[]).map(normalizeDetail)
}

export async function listFeatured(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('featured_products')
    .select(`sort_order, products(${LIST_SELECT},is_published,deleted_at)`)
    .order('sort_order')
  if (error) throw error
  return (data as unknown as { products: Product | null }[])
    .map((r) => r.products)
    .filter((p): p is Product => !!p && p.is_published !== false && !p.deleted_at)
}

export async function listRelated(productId: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from('related_products')
    .select(`sort_order, products:related_id(${LIST_SELECT})`)
    .eq('product_id', productId)
    .order('sort_order')
  if (error) throw error
  return (data as unknown as { products: Product | null }[]).map((r) => r.products).filter((p): p is Product => !!p)
}

export async function listLibraryAssets(): Promise<CustomizationAsset[]> {
  const { data, error } = await supabase.from('customization_assets').select('*').eq('is_active', true).order('sort_order').order('name')
  if (error) throw error
  return data as CustomizationAsset[]
}

/** Pezzi della taglia di riferimento (davanti, dietro, maniche) per posizionare loghi e sponsor liberi. */
export async function getPrintZones(productId: string): Promise<ZonePiece[]> {
  const { data, error } = await supabase.rpc('product_print_zones', { p_product: productId })
  if (error) throw error
  return (data ?? []) as ZonePiece[]
}
