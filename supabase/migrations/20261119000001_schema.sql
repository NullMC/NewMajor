-- =============================================================================
-- New Major — Schema principale
-- =============================================================================
-- Tabelle, enum, vincoli, indici e trigger di base.
-- Le policy RLS sono in 20261119000002_rls.sql, le funzioni RPC in
-- 20261119000003_functions.sql, lo storage in 20261119000004_storage.sql.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Enum
-- -----------------------------------------------------------------------------
create type public.user_role as enum ('customer', 'admin');
create type public.product_type as enum ('simple', 'kit');
create type public.availability as enum ('in_stock', 'on_request', 'out_of_stock');
create type public.model_shape as enum ('tshirt', 'longsleeve', 'tank', 'shorts');
create type public.area_side as enum ('front', 'back');
create type public.area_type as enum ('logo', 'sponsor', 'text', 'number', 'all_over');
create type public.payment_method as enum ('cash_on_delivery', 'bank_transfer');
create type public.payment_status as enum ('pending', 'awaiting_transfer', 'paid', 'refunded');
create type public.order_kind as enum ('order', 'quote', 'test');
create type public.notification_type as enum (
  'order_update', 'status_change', 'update_request', 'admin_message',
  'notice', 'discount', 'sale', 'tip', 'warning', 'custom'
);
create type public.contact_status as enum ('new', 'in_progress', 'closed');
create type public.page_kind as enum ('page', 'legal');
create type public.asset_kind as enum ('logo', 'sponsor', 'pattern', 'graphic');

-- -----------------------------------------------------------------------------
-- Utility: updated_at
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Profili e indirizzi
-- -----------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  full_name     text check (char_length(full_name) <= 120),
  phone         text check (char_length(phone) <= 40),
  company_name  text check (char_length(company_name) <= 160),
  vat_number    text check (char_length(vat_number) <= 32),
  fiscal_code   text check (char_length(fiscal_code) <= 32),
  role          public.user_role not null default 'customer',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index profiles_role_idx on public.profiles(role);
create index profiles_email_idx on public.profiles(lower(email));

create table public.addresses (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  label               text check (char_length(label) <= 60),
  full_name           text not null check (char_length(full_name) between 1 and 120),
  company             text check (char_length(company) <= 160),
  line1               text not null check (char_length(line1) between 1 and 200),
  line2               text check (char_length(line2) <= 200),
  city                text not null check (char_length(city) between 1 and 120),
  province            text check (char_length(province) <= 60),
  postal_code         text not null check (char_length(postal_code) between 1 and 16),
  country             text not null default 'IT' check (char_length(country) between 2 and 60),
  phone               text check (char_length(phone) <= 40),
  is_default_shipping boolean not null default false,
  is_default_billing  boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index addresses_user_idx on public.addresses(user_id);

-- -----------------------------------------------------------------------------
-- Catalogo
-- -----------------------------------------------------------------------------
create table public.categories (
  id           uuid primary key default gen_random_uuid(),
  parent_id    uuid references public.categories(id) on delete set null,
  name         text not null check (char_length(name) between 1 and 120),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description  text,
  image_path   text,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index categories_parent_idx on public.categories(parent_id);

-- Tipologie di capo / brand base (es. Smarcata, adidas, Mizuno)
create table public.garment_types (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 120),
  brand        text check (char_length(brand) <= 120),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description  text,
  price_delta  numeric(10,2) not null default 0,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.products (
  id                uuid primary key default gen_random_uuid(),
  category_id       uuid references public.categories(id) on delete set null,
  name              text not null check (char_length(name) between 1 and 160),
  slug              text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  short_description text check (char_length(short_description) <= 400),
  description       text,
  product_type      public.product_type not null default 'simple',
  base_price        numeric(10,2) not null default 0 check (base_price >= 0),
  availability      public.availability not null default 'in_stock',
  is_configurable   boolean not null default true,
  model_shape       public.model_shape not null default 'tshirt',
  sizes             text[] not null default '{}',
  min_quantity      integer not null default 1 check (min_quantity >= 1),
  attributes        jsonb not null default '{}'::jsonb,
  is_published      boolean not null default false,
  sort_order        integer not null default 0,
  seo_title         text check (char_length(seo_title) <= 120),
  seo_description   text check (char_length(seo_description) <= 320),
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index products_category_idx on public.products(category_id);
create index products_published_idx on public.products(is_published, sort_order) where deleted_at is null;
create index products_attributes_idx on public.products using gin (attributes);
create index products_search_idx on public.products using gin (
  to_tsvector('italian', coalesce(name,'') || ' ' || coalesce(short_description,''))
);

create table public.product_garment_types (
  product_id      uuid not null references public.products(id) on delete cascade,
  garment_type_id uuid not null references public.garment_types(id) on delete cascade,
  price_delta     numeric(10,2),          -- se null usa garment_types.price_delta
  sort_order      integer not null default 0,
  primary key (product_id, garment_type_id)
);
create index pgt_garment_idx on public.product_garment_types(garment_type_id);

-- Varianti di colore/base
create table public.product_variants (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products(id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 80),
  color_hex      text not null default '#FFFFFF' check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_hex  text check (secondary_hex ~ '^#[0-9A-Fa-f]{6}$'),
  sku            text check (char_length(sku) <= 64),
  price_delta    numeric(10,2) not null default 0,
  sort_order     integer not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index product_variants_product_idx on public.product_variants(product_id);

-- Opzioni generiche (tessuto, collo, maniche, ...)
create table public.product_options (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  help_text    text check (char_length(help_text) <= 300),
  is_required  boolean not null default false,
  is_multiple  boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index product_options_product_idx on public.product_options(product_id);

create table public.product_option_values (
  id           uuid primary key default gen_random_uuid(),
  option_id    uuid not null references public.product_options(id) on delete cascade,
  label        text not null check (char_length(label) between 1 and 80),
  price_delta  numeric(10,2) not null default 0,
  color_hex    text check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);
create index pov_option_idx on public.product_option_values(option_id);

create table public.product_images (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  storage_path  text not null,
  alt           text check (char_length(alt) <= 200),
  width         integer,
  height        integer,
  sort_order    integer not null default 0,
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now()
);
create index product_images_product_idx on public.product_images(product_id, sort_order);
create unique index product_images_one_primary on public.product_images(product_id) where is_primary;

-- Componenti di un kit (es. maglia + pantaloncino + calzettoni)
create table public.kit_items (
  id                    uuid primary key default gen_random_uuid(),
  kit_id                uuid not null references public.products(id) on delete cascade,
  component_product_id  uuid references public.products(id) on delete set null,
  label                 text not null check (char_length(label) between 1 and 80),
  model_shape           public.model_shape,
  quantity              integer not null default 1 check (quantity >= 1),
  sizes                 text[] not null default '{}',
  sort_order            integer not null default 0,
  created_at            timestamptz not null default now()
);
create index kit_items_kit_idx on public.kit_items(kit_id);

-- Aree di personalizzazione (coordinate in % del pannello fronte/retro)
create table public.customization_areas (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references public.products(id) on delete cascade,
  kit_item_id      uuid references public.kit_items(id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 80),
  side             public.area_side not null default 'front',
  area_type        public.area_type not null default 'logo',
  x                numeric(5,2) not null default 40 check (x between 0 and 100),
  y                numeric(5,2) not null default 30 check (y between 0 and 100),
  width            numeric(5,2) not null default 20 check (width > 0 and width <= 100),
  height           numeric(5,2) not null default 20 check (height > 0 and height <= 100),
  print_width_cm   numeric(6,2) not null default 10 check (print_width_cm > 0),
  print_height_cm  numeric(6,2) not null default 10 check (print_height_cm > 0),
  price_delta      numeric(10,2) not null default 0,
  max_chars        integer check (max_chars between 1 and 40),
  is_required      boolean not null default false,
  allow_library    boolean not null default true,
  allow_upload     boolean not null default true,
  sort_order       integer not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index customization_areas_product_idx on public.customization_areas(product_id);

-- Libreria grafiche caricate dall'admin (loghi, sponsor, pattern all-over)
create table public.customization_assets (
  id            uuid primary key default gen_random_uuid(),
  kind          public.asset_kind not null default 'graphic',
  name          text not null check (char_length(name) between 1 and 120),
  storage_path  text not null,
  width         integer,
  height        integer,
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Sconti a scaglioni sulla quantità
create table public.price_tiers (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references public.products(id) on delete cascade,
  min_quantity      integer not null check (min_quantity >= 1),
  discount_percent  numeric(5,2) not null check (discount_percent >= 0 and discount_percent < 100),
  created_at        timestamptz not null default now(),
  unique (product_id, min_quantity)
);

create table public.related_products (
  product_id  uuid not null references public.products(id) on delete cascade,
  related_id  uuid not null references public.products(id) on delete cascade,
  sort_order  integer not null default 0,
  primary key (product_id, related_id),
  check (product_id <> related_id)
);

create table public.featured_products (
  product_id  uuid primary key references public.products(id) on delete cascade,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Carrello
-- -----------------------------------------------------------------------------
create table public.carts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.cart_items (
  id             uuid primary key default gen_random_uuid(),
  cart_id        uuid not null references public.carts(id) on delete cascade,
  product_id     uuid not null references public.products(id) on delete cascade,
  configuration  jsonb not null default '{}'::jsonb,
  quantity       integer not null default 1 check (quantity between 1 and 10000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index cart_items_cart_idx on public.cart_items(cart_id);

-- -----------------------------------------------------------------------------
-- Ordini
-- -----------------------------------------------------------------------------
create table public.order_statuses (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique check (code ~ '^[a-z0-9_]+$'),
  label         text not null check (char_length(label) between 1 and 80),
  description   text check (char_length(description) <= 400),
  progress      smallint not null default 0 check (progress between 0 and 100),
  sort_order    integer not null default 0,
  is_initial    boolean not null default false,
  is_final      boolean not null default false,
  is_cancelled  boolean not null default false,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create sequence public.order_reference_seq start 1;

create table public.orders (
  id                      uuid primary key default gen_random_uuid(),
  reference               text not null unique,
  user_id                 uuid references public.profiles(id) on delete set null,
  kind                    public.order_kind not null default 'order',
  status_id               uuid not null references public.order_statuses(id),
  payment_method          public.payment_method not null,
  payment_status          public.payment_status not null default 'pending',
  payment_confirmed_at    timestamptz,
  customer_name           text not null check (char_length(customer_name) between 1 and 160),
  customer_email          text check (char_length(customer_email) <= 254),
  customer_phone          text check (char_length(customer_phone) <= 40),
  shipping_address        jsonb not null,
  billing_address         jsonb,
  customer_notes          text check (char_length(customer_notes) <= 2000),
  subtotal                numeric(12,2) not null default 0,
  shipping_cost           numeric(12,2),
  total                   numeric(12,2) not null default 0,
  last_update_request_at  timestamptz,
  created_by              uuid references public.profiles(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index orders_user_idx on public.orders(user_id, created_at desc);
create index orders_status_idx on public.orders(status_id);
create index orders_created_idx on public.orders(created_at desc);

create table public.order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete cascade,
  product_id        uuid references public.products(id) on delete set null,
  product_name      text not null,
  product_snapshot  jsonb not null default '{}'::jsonb,
  configuration     jsonb not null default '{}'::jsonb,
  quantity          integer not null check (quantity >= 1),
  unit_price        numeric(12,2) not null,
  line_total        numeric(12,2) not null,
  created_at        timestamptz not null default now()
);
create index order_items_order_idx on public.order_items(order_id);

create table public.order_item_customizations (
  id             uuid primary key default gen_random_uuid(),
  order_item_id  uuid not null references public.order_items(id) on delete cascade,
  area_id        uuid,
  area_name      text not null,
  area_type      public.area_type not null,
  side           public.area_side,
  asset_path     text,          -- file cliente (bucket customer-uploads) o libreria (public-media)
  asset_bucket   text,
  asset_meta     jsonb not null default '{}'::jsonb,  -- dimensioni, dpi effettivi, avvisi qualità
  created_at     timestamptz not null default now()
);
create index oic_item_idx on public.order_item_customizations(order_item_id);

create table public.order_item_roster (
  id             uuid primary key default gen_random_uuid(),
  order_item_id  uuid not null references public.order_items(id) on delete cascade,
  position       integer not null default 0,
  player_name    text check (char_length(player_name) <= 40),
  player_number  text check (char_length(player_number) <= 4),
  size           text check (char_length(size) <= 16),
  sizes          jsonb not null default '{}'::jsonb,   -- per kit: { kit_item_id: taglia }
  quantity       integer not null default 1 check (quantity >= 1)
);
create index oir_item_idx on public.order_item_roster(order_item_id);

create table public.order_status_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  status_id   uuid not null references public.order_statuses(id),
  note        text check (char_length(note) <= 2000),   -- visibile al cliente
  changed_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index osh_order_idx on public.order_status_history(order_id, created_at desc);

-- Note interne (solo admin)
create table public.order_internal_notes (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 4000),
  author_id   uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index oin_order_idx on public.order_internal_notes(order_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Notifiche interne
-- -----------------------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        public.notification_type not null default 'custom',
  title       text not null check (char_length(title) between 1 and 160),
  message     text not null check (char_length(message) between 1 and 4000),
  link        text check (char_length(link) <= 300 and (link is null or link ~ '^/')),
  is_read     boolean not null default false,
  read_at     timestamptz,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, is_read, created_at desc);

-- -----------------------------------------------------------------------------
-- Contatti
-- -----------------------------------------------------------------------------
create table public.contact_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles(id) on delete set null,
  name         text not null check (char_length(name) between 1 and 120),
  email        text not null check (char_length(email) between 3 and 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone        text check (char_length(phone) <= 40),
  subject      text check (char_length(subject) <= 160),
  message      text not null check (char_length(message) between 5 and 5000),
  status       public.contact_status not null default 'new',
  admin_notes  text check (char_length(admin_notes) <= 4000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index contact_requests_status_idx on public.contact_requests(status, created_at desc);

-- -----------------------------------------------------------------------------
-- Contenuti
-- -----------------------------------------------------------------------------
-- Pagine (Chi siamo e pagine legali: termini, privacy, cookie, rimborsi)
create table public.pages (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  kind             public.page_kind not null default 'page',
  title            text not null check (char_length(title) between 1 and 160),
  excerpt          text check (char_length(excerpt) <= 400),
  content          text not null default '',        -- Markdown, sanificato in rendering
  seo_title        text check (char_length(seo_title) <= 120),
  seo_description  text check (char_length(seo_description) <= 320),
  is_published     boolean not null default false,
  sort_order       integer not null default 0,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Sezioni/blocchi del sito (home, banner, CTA) come JSON strutturato
create table public.site_content (
  key         text primary key check (key ~ '^[a-z0-9_.]+$'),
  value       jsonb not null default '{}'::jsonb,
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);

create table public.faqs (
  id          uuid primary key default gen_random_uuid(),
  question    text not null check (char_length(question) between 1 and 300),
  answer      text not null check (char_length(answer) between 1 and 6000),
  category    text check (char_length(category) <= 80),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.settings (
  key         text primary key check (key ~ '^[a-z0-9_.]+$'),
  value       jsonb not null default '{}'::jsonb,
  is_public   boolean not null default false,
  updated_at  timestamptz not null default now()
);

-- Libreria media generica (immagini sito)
create table public.media (
  id           uuid primary key default gen_random_uuid(),
  bucket       text not null default 'public-media',
  path         text not null,
  alt          text check (char_length(alt) <= 200),
  mime_type    text,
  size_bytes   bigint,
  width        integer,
  height       integer,
  folder       text not null default 'library',
  uploaded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (bucket, path)
);

-- -----------------------------------------------------------------------------
-- Backoffice
-- -----------------------------------------------------------------------------
create table public.admin_reminders (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid references public.orders(id) on delete cascade,
  user_id      uuid references public.profiles(id) on delete set null,
  title        text not null check (char_length(title) between 1 and 200),
  note         text check (char_length(note) <= 2000),
  due_at       timestamptz,
  is_done      boolean not null default false,
  done_at      timestamptz,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index admin_reminders_open_idx on public.admin_reminders(is_done, due_at);

create table public.audit_logs (
  id          bigserial primary key,
  actor_id    uuid,
  action      text not null,
  entity      text not null,
  entity_id   text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs(created_at desc);
create index audit_logs_entity_idx on public.audit_logs(entity, entity_id);

-- -----------------------------------------------------------------------------
-- Trigger updated_at
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','addresses','categories','garment_types','products','product_variants',
    'product_options','customization_areas','customization_assets','carts','cart_items',
    'order_statuses','orders','contact_requests','pages','faqs','settings','admin_reminders'
  ] loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

create or replace function public.touch_site_content()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger site_content_touch before insert or update on public.site_content
  for each row execute function public.touch_site_content();
