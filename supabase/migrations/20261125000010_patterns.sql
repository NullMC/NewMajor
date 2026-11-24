-- Cartamodelli dei prodotti: forme reali dei pezzi (fronte, retro, maniche, colletto…) per
-- ogni taglia, importate dai file CAD del cliente (DXF AAMA/ASTM o SVG). Servono a generare
-- il file di produzione (PDF 1:1) con le grafiche posizionate in centimetri reali.
-- Migration additiva. Accesso riservato agli admin: i cartamodelli sono proprietà del cliente.

create table public.pattern_sets (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references public.products(id) on delete cascade,
  kit_item_id      uuid references public.kit_items(id) on delete cascade,
  garment_type_id  uuid references public.garment_types(id) on delete cascade,
  name             text not null default 'Cartamodello' check (char_length(name) between 1 and 120),
  reference_size   text check (char_length(reference_size) <= 20),
  source_path      text check (char_length(source_path) <= 300),   -- file originale nel bucket "patterns"
  source_name      text check (char_length(source_name) <= 200),
  source_unit      text not null default 'mm' check (source_unit in ('mm', 'cm', 'in')),
  notes            text check (char_length(notes) <= 2000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
-- un cartamodello per prodotto / componente kit / tipologia capo
create unique index pattern_sets_unique on public.pattern_sets (
  product_id,
  coalesce(kit_item_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(garment_type_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

create table public.pattern_pieces (
  id              uuid primary key default gen_random_uuid(),
  pattern_set_id  uuid not null references public.pattern_sets(id) on delete cascade,
  size            text not null check (char_length(size) between 1 and 20),
  piece           text not null check (piece in ('front', 'back', 'sleeve_left', 'sleeve_right', 'collar', 'cuff', 'other')),
  name            text not null check (char_length(name) between 1 and 120),
  quantity        integer not null default 1 check (quantity between 1 and 20),
  -- linea di taglio: [[x, y], …] in millimetri, y verso l'alto, poligono chiuso
  outline         jsonb not null check (jsonb_typeof(outline) = 'array' and jsonb_array_length(outline) >= 3),
  -- punto di riferimento in mm: centro collo (fronte/retro), attaccatura spalla (maniche)
  anchor          jsonb not null default '{}'::jsonb check (jsonb_typeof(anchor) = 'object'),
  mirror          boolean not null default false,
  grain_angle     numeric(6,2) not null default 0,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index pattern_pieces_set_idx on public.pattern_pieces (pattern_set_id, size, sort_order);

create trigger pattern_sets_updated_at before update on public.pattern_sets
  for each row execute function public.set_updated_at();
create trigger pattern_pieces_updated_at before update on public.pattern_pieces
  for each row execute function public.set_updated_at();
create trigger pattern_sets_audit after insert or update or delete on public.pattern_sets
  for each row execute function public.audit_trigger();

alter table public.pattern_sets enable row level security;
alter table public.pattern_pieces enable row level security;
create policy "admin_all_pattern_sets" on public.pattern_sets
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_all_pattern_pieces" on public.pattern_pieces
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.pattern_sets, public.pattern_pieces from anon;
grant select, insert, update, delete on public.pattern_sets, public.pattern_pieces to authenticated;

-- File sorgente dei cartamodelli: bucket privato, solo admin ---------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('patterns', 'patterns', false, 26214400,
        array['image/vnd.dxf', 'application/dxf', 'application/x-dxf', 'image/x-dxf', 'application/octet-stream', 'image/svg+xml', 'text/plain'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "patterns_admin_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'patterns' and public.is_admin())
  with check (bucket_id = 'patterns' and public.is_admin());
