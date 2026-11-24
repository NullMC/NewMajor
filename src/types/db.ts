// Tipi di dominio allineati allo schema Supabase (supabase/migrations).

export type UserRole = 'customer' | 'admin'
export type ProductType = 'simple' | 'kit'
export type Availability = 'in_stock' | 'on_request' | 'out_of_stock'
export type ModelShape = 'tshirt' | 'longsleeve' | 'tank' | 'shorts'
export type AreaSide = 'front' | 'back'
export type AreaType = 'logo' | 'sponsor' | 'text' | 'number' | 'all_over'
export type PaymentMethod = 'cash_on_delivery' | 'bank_transfer'
export type PaymentStatus = 'pending' | 'awaiting_transfer' | 'paid' | 'refunded'
export type OrderKind = 'order' | 'quote' | 'test'
export type NotificationType =
  | 'order_update' | 'status_change' | 'update_request' | 'admin_message'
  | 'notice' | 'discount' | 'sale' | 'tip' | 'warning' | 'custom'
export type ContactStatus = 'new' | 'in_progress' | 'closed'
export type PageKind = 'page' | 'legal'
export type AssetKind = 'logo' | 'sponsor' | 'pattern' | 'graphic'

export interface Profile {
  id: string
  /** Recapito email del cliente (facoltativo in registrazione, obbligatorio per ordinare) */
  email: string | null
  /** Nome utente di accesso */
  username: string | null
  full_name: string | null
  phone: string | null
  company_name: string | null
  vat_number: string | null
  fiscal_code: string | null
  role: UserRole
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Address {
  id: string
  user_id: string
  label: string | null
  full_name: string
  company: string | null
  line1: string
  line2: string | null
  city: string
  province: string | null
  postal_code: string
  country: string
  phone: string | null
  is_default_shipping: boolean
  is_default_billing: boolean
}

export type AddressInput = Omit<Address, 'id' | 'user_id' | 'is_default_shipping' | 'is_default_billing'> &
  Partial<Pick<Address, 'is_default_shipping' | 'is_default_billing'>>

export interface Category {
  id: string
  parent_id: string | null
  name: string
  slug: string
  description: string | null
  image_path: string | null
  sort_order: number
  is_active: boolean
}

export interface GarmentType {
  id: string
  name: string
  brand: string | null
  slug: string
  description: string | null
  price_delta: number
  sort_order: number
  is_active: boolean
}

export interface ProductImage {
  id: string
  product_id: string
  storage_path: string
  alt: string | null
  width: number | null
  height: number | null
  sort_order: number
  is_primary: boolean
}

export interface ProductVariant {
  id: string
  product_id: string
  name: string
  color_hex: string
  secondary_hex: string | null
  sku: string | null
  price_delta: number
  sort_order: number
  is_active: boolean
}

export interface ProductOptionValue {
  id: string
  option_id: string
  label: string
  price_delta: number
  color_hex: string | null
  sort_order: number
  is_active: boolean
}

export interface ProductOption {
  id: string
  product_id: string
  name: string
  help_text: string | null
  is_required: boolean
  is_multiple: boolean
  sort_order: number
  product_option_values?: ProductOptionValue[]
}

export interface KitItem {
  id: string
  kit_id: string
  component_product_id: string | null
  label: string
  model_shape: ModelShape | null
  quantity: number
  sizes: string[]
  sort_order: number
}

export interface CustomizationArea {
  id: string
  product_id: string
  kit_item_id: string | null
  name: string
  side: AreaSide
  area_type: AreaType
  x: number
  y: number
  width: number
  height: number
  print_width_cm: number
  print_height_cm: number
  price_delta: number
  max_chars: number | null
  is_required: boolean
  allow_library: boolean
  allow_upload: boolean
  sort_order: number
  is_active: boolean
}

export interface CustomizationAsset {
  id: string
  kind: AssetKind
  name: string
  storage_path: string
  width: number | null
  height: number | null
  sort_order: number
  is_active: boolean
}

export interface PriceTier {
  id: string
  product_id: string
  min_quantity: number
  discount_percent: number
}

export interface Product {
  id: string
  category_id: string | null
  name: string
  slug: string
  short_description: string | null
  description: string | null
  product_type: ProductType
  base_price: number
  availability: Availability
  is_configurable: boolean
  model_shape: ModelShape
  sizes: string[]
  min_quantity: number
  attributes: Record<string, string>
  is_published: boolean
  sort_order: number
  seo_title: string | null
  seo_description: string | null
  /** Loghi e sponsor liberi: 0 = non consentiti. */
  free_elements_max?: number
  free_logo_price?: number
  free_sponsor_price?: number
  free_min_width_cm?: number
  free_max_width_cm?: number
  free_zones?: ('front' | 'back' | 'sleeve_left' | 'sleeve_right')[]
  deleted_at: string | null
  created_at: string
  updated_at: string
  product_images?: ProductImage[]
  categories?: Pick<Category, 'id' | 'name' | 'slug'> | null
  product_garment_types?: { garment_type_id: string; price_delta: number | null; sort_order: number; garment_types: GarmentType | null }[]
}

export interface ProductDetail extends Product {
  product_variants: ProductVariant[]
  product_options: ProductOption[]
  customization_areas: CustomizationArea[]
  kit_items: KitItem[]
  price_tiers: PriceTier[]
}

export interface OrderStatus {
  id: string
  code: string
  label: string
  description: string | null
  progress: number
  sort_order: number
  is_initial: boolean
  is_final: boolean
  is_cancelled: boolean
  is_active: boolean
}

export interface AddressSnapshot {
  full_name: string
  company?: string | null
  line1: string
  line2?: string | null
  city: string
  province?: string | null
  postal_code: string
  country: string
  phone?: string | null
  vat_number?: string | null
  fiscal_code?: string | null
}

export interface Order {
  id: string
  reference: string
  user_id: string | null
  kind: OrderKind
  status_id: string
  payment_method: PaymentMethod
  payment_status: PaymentStatus
  payment_confirmed_at: string | null
  customer_name: string
  customer_email: string | null
  customer_phone: string | null
  shipping_address: AddressSnapshot
  billing_address: AddressSnapshot | null
  customer_notes: string | null
  subtotal: number
  shipping_cost: number | null
  total: number
  last_update_request_at: string | null
  created_at: string
  updated_at: string
  order_statuses?: OrderStatus
}

export interface OrderItemCustomization {
  id: string
  order_item_id: string
  area_id: string | null
  area_name: string
  area_type: AreaType
  side: AreaSide | null
  asset_path: string | null
  asset_bucket: string | null
  asset_meta: Record<string, unknown>
}

export interface OrderItemRoster {
  id: string
  order_item_id: string
  position: number
  player_name: string | null
  player_number: string | null
  size: string | null
  sizes: Record<string, string>
  quantity: number
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string | null
  product_name: string
  product_snapshot: Record<string, unknown>
  configuration: import('./config').Configuration
  quantity: number
  unit_price: number
  line_total: number
  order_item_customizations?: OrderItemCustomization[]
  order_item_roster?: OrderItemRoster[]
}

export interface OrderStatusHistory {
  id: string
  order_id: string
  status_id: string
  note: string | null
  changed_by: string | null
  created_at: string
  order_statuses?: Pick<OrderStatus, 'label' | 'progress' | 'is_cancelled'>
}

export interface OrderInternalNote {
  id: string
  order_id: string
  body: string
  author_id: string | null
  created_at: string
  profiles?: { full_name: string | null; email: string | null } | null
}

export interface AppNotification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  message: string
  link: string | null
  is_read: boolean
  read_at: string | null
  created_at: string
}

export interface ContactRequest {
  id: string
  user_id: string | null
  name: string
  email: string
  phone: string | null
  subject: string | null
  message: string
  status: ContactStatus
  admin_notes: string | null
  created_at: string
}

export interface Page {
  id: string
  slug: string
  kind: PageKind
  title: string
  excerpt: string | null
  content: string
  seo_title: string | null
  seo_description: string | null
  is_published: boolean
  sort_order: number
  updated_at: string
}

export interface Faq {
  id: string
  question: string
  answer: string
  category: string | null
  sort_order: number
  is_active: boolean
}

export type PortfolioPlatform = 'instagram' | 'facebook' | 'tiktok' | 'altro'

export interface PortfolioPost {
  id: string
  team_name: string
  title: string | null
  caption: string | null
  image_path: string
  image_alt: string | null
  post_url: string | null
  platform: PortfolioPlatform | null
  posted_on: string | null
  is_published: boolean
  sort_order: number
  created_at: string
}

export interface AdminReminder {
  id: string
  order_id: string | null
  user_id: string | null
  title: string
  note: string | null
  due_at: string | null
  is_done: boolean
  done_at: string | null
  created_at: string
  orders?: { reference: string } | null
}

export interface MediaItem {
  id: string
  bucket: string
  path: string
  alt: string | null
  mime_type: string | null
  size_bytes: number | null
  width: number | null
  height: number | null
  folder: string
  created_at: string
}

export interface AuditLog {
  id: number
  actor_id: string | null
  action: string
  entity: string
  entity_id: string | null
  details: Record<string, unknown>
  created_at: string
}

// Impostazioni -----------------------------------------------------------------
export interface CompanySettings {
  name: string
  legal_address: string
  alt_address?: string
  show_alt_address?: boolean
  vat_number: string
  rea: string
  phone: string
  phone_alt?: string
  email?: string
}

export interface BankTransferSettings {
  account_holder: string
  iban: string
  bank_name?: string
  bic?: string
  instructions?: string
}

export interface PaymentsSettings {
  cash_on_delivery: { enabled: boolean; note?: string }
  bank_transfer: { enabled: boolean; note?: string }
}

export interface ShippingSettings {
  mode: 'quote' | 'flat'
  amount: number | null
  free_over: number | null
  note?: string
}

export interface CatalogSettings {
  filters: { key: string; label: string }[]
}

export interface QualitySettings {
  min_dpi: number
  warn_dpi: number
  max_file_mb: number
}

export interface CookieSettings {
  text: string
  policy_link: string
}

export interface SettingsMap {
  company: CompanySettings
  bank_transfer: BankTransferSettings
  payments: PaymentsSettings
  shipping: ShippingSettings
  catalog: CatalogSettings
  quality: QualitySettings
  cookie: CookieSettings
}
