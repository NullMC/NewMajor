-- Aree di stampa del cliente, tecniche di stampa con prezzo in base all'area, fasce su maniche e
-- pantaloncino, colori per sezione nell'all-over, pezzi "gamba" del pantaloncino, sagoma piumino.
--
-- Configurazione (cart_items / order_items.configuration):
--   elements: [{ id, kind: 'graphic'|'text' (o 'logo'|'sponsor' delle versioni precedenti),
--                zone: 'front'|'back'|'sleeve_left'|'sleeve_right', kitItemId?,
--                technique?: 'screen'|'dtf'|'embroidery'|'sublimation',
--                asset?: {…} (grafiche), text?, font?, color? (testi),
--                xCm, yCm (centro dal punto di riferimento del pezzo, y verso il basso),
--                widthCm, heightCm, rotation }]
--     Gli elementi con technique sono "aree di stampa": devono stare nell'area massima della
--     zona (print_zones), senza sovrapporsi; prezzo = min + (area / area massima) × (max − min).
--     Gli elementi senza technique (loghi/sponsor liberi precedenti) mantengono le regole e i
--     prezzi di prima, così le configurazioni già salvate restano valide.
--   bands: [{ kitItemId?, mode: 'color'|'graphic', color?, asset? }]  fascia su maniche o
--     pantaloncino, se attiva sul prodotto/componente; prezzo band_price.
--   allOver[].colors: { front?|back?|sleeve_left?|sleeve_right?|leg_left?|leg_right?: '#RRGGBB' }
--     colore diverso per sezione al posto della grafica.

alter type public.model_shape add value if not exists 'puffer';

-- Pezzi del pantaloncino: una gamba intera (davanti e dietro uniti sulla cucitura laterale)
alter table public.pattern_pieces drop constraint if exists pattern_pieces_piece_check;
alter table public.pattern_pieces add constraint pattern_pieces_piece_check
  check (piece in ('front', 'back', 'sleeve_left', 'sleeve_right', 'leg_left', 'leg_right', 'collar', 'cuff', 'other'));

-- Tecniche di stampa ------------------------------------------------------------------------
create table public.print_techniques (
  code           text primary key check (code in ('screen', 'dtf', 'embroidery', 'sublimation')),
  name           text not null check (char_length(name) between 1 and 60),
  min_price      numeric(10,2) not null default 0 check (min_price >= 0),
  max_price      numeric(10,2) not null default 0 check (max_price >= min_price),
  all_over_only  boolean not null default false,
  is_active      boolean not null default true,
  sort_order     integer not null default 0,
  updated_at     timestamptz not null default now()
);
insert into public.print_techniques (code, name, min_price, max_price, all_over_only, sort_order) values
  ('screen', 'Serigrafia', 1.50, 5.00, false, 10),
  ('dtf', 'Stampa DTF', 1.50, 5.00, false, 20),
  ('embroidery', 'Ricamo', 1.50, 5.00, false, 30),
  -- prezzi da impostare dal backoffice; solo su prodotti/componenti con grafica all-over
  ('sublimation', 'Sublimazione', 0, 0, true, 40);

alter table public.print_techniques enable row level security;
create policy "admin_all_print_techniques" on public.print_techniques
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "print_techniques_public" on public.print_techniques
  for select to anon, authenticated using (true);
grant select on public.print_techniques to anon, authenticated;
grant insert, update, delete on public.print_techniques to authenticated;

-- Zone di stampa (area massima) per prodotto o componente del kit -----------------------------
-- Rettangolo in cm rispetto al punto di riferimento del pezzo (centro collo per davanti/dietro,
-- sommità della manica; per il pantaloncino il centro vita): x verso destra guardando il capo
-- dall'esterno, y verso il basso; x_cm, y_cm = angolo in alto a sinistra.
create table public.print_zones (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products(id) on delete cascade,
  kit_item_id    uuid references public.kit_items(id) on delete cascade,
  zone           text not null check (zone in ('front', 'back', 'sleeve_left', 'sleeve_right')),
  x_cm           numeric(6,2) not null check (x_cm between -200 and 200),
  y_cm           numeric(6,2) not null check (y_cm between -200 and 200),
  width_cm       numeric(6,2) not null check (width_cm > 0 and width_cm <= 200),
  height_cm      numeric(6,2) not null check (height_cm > 0 and height_cm <= 200),
  max_items      integer not null default 3 check (max_items between 1 and 20),
  allow_graphic  boolean not null default true,
  allow_text     boolean not null default true,
  techniques     text[] not null default '{screen,dtf,embroidery}'
    check (cardinality(techniques) >= 1 and techniques <@ array['screen', 'dtf', 'embroidery', 'sublimation']),
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (allow_graphic or allow_text)
);
create unique index print_zones_unique on public.print_zones
  (product_id, coalesce(kit_item_id, '00000000-0000-0000-0000-000000000000'::uuid), zone);

alter table public.print_zones enable row level security;
create policy "admin_all_print_zones" on public.print_zones
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "print_zones_public" on public.print_zones
  for select to anon, authenticated using (public.product_is_visible(product_id));
grant select on public.print_zones to anon, authenticated;
grant insert, update, delete on public.print_zones to authenticated;

-- Fasce su maniche (capi) o fondo gamba (pantaloncini/pantaloni) ---------------------------------
alter table public.products
  add column band_enabled   boolean not null default false,
  add column band_height_cm numeric(5,2) not null default 4 check (band_height_cm > 0 and band_height_cm <= 30),
  add column band_price     numeric(10,2) not null default 0 check (band_price >= 0);
alter table public.kit_items
  add column band_enabled   boolean not null default false,
  add column band_height_cm numeric(5,2) not null default 4 check (band_height_cm > 0 and band_height_cm <= 30),
  add column band_price     numeric(10,2) not null default 0 check (band_price >= 0);

-- Pezzi pubblici della taglia di riferimento: anche le gambe del pantaloncino ------------------
create or replace function public.product_print_zones(p_product uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.product_is_visible(p_product) or public.is_admin()) then
    raise exception 'product_not_found';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'kitItemId', s.kit_item_id,
      'zone', p.piece,
      'size', p.size,
      'name', p.name,
      'outline', p.outline,
      'anchor', p.anchor
    ) order by s.kit_item_id nulls first, p.sort_order)
    from pattern_sets s
    join pattern_pieces p on p.pattern_set_id = s.id and p.size = s.reference_size
    where s.product_id = p_product and s.garment_type_id is null
      and p.piece in ('front', 'back', 'sleeve_left', 'sleeve_right', 'leg_left', 'leg_right')
  ), '[]'::jsonb);
end $$;

-- Prezzo di un elemento: tecnica e area, o prezzo fisso dei loghi/sponsor liberi precedenti ---
create or replace function public.print_element_price(p_product uuid, p_el jsonb)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_t   print_techniques%rowtype;
  v_z   print_zones%rowtype;
  v_kit uuid := nullif(p_el->>'kitItemId', '')::uuid;
  v_area numeric;
begin
  if coalesce(p_el->>'technique', '') = '' then
    return coalesce((
      select case when p_el->>'kind' = 'sponsor' then free_sponsor_price when p_el->>'kind' = 'logo' then free_logo_price else 0 end
      from products where id = p_product
    ), 0);
  end if;
  select * into v_t from print_techniques where code = p_el->>'technique';
  select * into v_z from print_zones
   where product_id = p_product and zone = p_el->>'zone' and kit_item_id is not distinct from v_kit;
  if v_t.code is null or v_z.id is null then return 0; end if;
  v_area := coalesce((p_el->>'widthCm')::numeric, 0) * coalesce((p_el->>'heightCm')::numeric, 0);
  return round(v_t.min_price + least(1, greatest(0, v_area / (v_z.width_cm * v_z.height_cm))) * (v_t.max_price - v_t.min_price), 2);
end $$;
revoke all on function public.print_element_price(uuid, jsonb) from public;
grant execute on function public.print_element_price(uuid, jsonb) to anon, authenticated;

-- Prezzo unitario --------------------------------------------------------------------------
create or replace function public.compute_unit_price(p_product uuid, p_config jsonb)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_price   numeric(12,2);
  v_all     numeric(10,2);
  v_band    numeric(10,2);
  v_gt      uuid := nullif(p_config->>'garmentTypeId', '')::uuid;
  v_variant uuid := nullif(p_config->>'variantId', '')::uuid;
begin
  if not (public.product_is_visible(p_product) or public.is_admin()) then
    raise exception 'product_not_found';
  end if;

  select base_price, all_over_price, band_price into v_price, v_all, v_band from products where id = p_product;
  if v_price is null then raise exception 'product_not_found'; end if;

  if v_gt is not null then
    v_price := v_price + coalesce((
      select coalesce(pgt.price_delta, g.price_delta)
      from product_garment_types pgt
      join garment_types g on g.id = pgt.garment_type_id
      where pgt.product_id = p_product and pgt.garment_type_id = v_gt and g.is_active
    ), 0);
  end if;

  if v_variant is not null then
    v_price := v_price + coalesce((
      select price_delta from product_variants
      where id = v_variant and product_id = p_product and is_active
    ), 0);
  end if;

  if jsonb_typeof(p_config->'optionValueIds') = 'array' then
    v_price := v_price + coalesce((
      select sum(v.price_delta)
      from product_option_values v
      join product_options o on o.id = v.option_id
      where o.product_id = p_product and v.is_active
        and v.id in (select x::uuid from jsonb_array_elements_text(p_config->'optionValueIds') x)
    ), 0);
  end if;

  if jsonb_typeof(p_config->'areas') = 'object' then
    v_price := v_price + coalesce((
      select sum(a.price_delta)
      from customization_areas a
      where a.product_id = p_product and a.is_active
        and a.id in (
          select e.key::uuid from jsonb_each(p_config->'areas') e
          where coalesce((e.value->>'enabled')::boolean, false)
        )
    ), 0);
  end if;

  if jsonb_typeof(p_config->'elements') = 'array' then
    v_price := v_price + coalesce((
      select sum(public.print_element_price(p_product, e)) from jsonb_array_elements(p_config->'elements') e
    ), 0);
  end if;

  if jsonb_typeof(p_config->'allOver') = 'array' then
    v_price := v_price + v_all * jsonb_array_length(p_config->'allOver');
  end if;

  if jsonb_typeof(p_config->'bands') = 'array' then
    v_price := v_price + coalesce((
      select sum(case when coalesce(b->>'kitItemId', '') = '' then v_band
                      else (select k.band_price from kit_items k where k.kit_id = p_product and k.id::text = b->>'kitItemId') end)
      from jsonb_array_elements(p_config->'bands') b
    ), 0);
  end if;

  return round(v_price, 2);
end $$;

-- Validazione ------------------------------------------------------------------------------
create or replace function public.validate_configuration(p_product uuid, p_config jsonb, p_quantity integer)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  v_p products%rowtype;
  v_gt uuid := nullif(p_config->>'garmentTypeId', '')::uuid;
  v_n integer := 0;
  v_kits uuid[];
  v_els jsonb := case when jsonb_typeof(p_config->'elements') = 'array' then p_config->'elements' else '[]'::jsonb end;
  r record;
begin
  select * into v_p from products where id = p_product;
  if not found then raise exception 'product_not_found'; end if;

  if p_quantity < v_p.min_quantity then
    raise exception 'min_quantity:%:%', v_p.name, v_p.min_quantity;
  end if;

  if exists (select 1 from product_garment_types where product_id = p_product) then
    if v_gt is null or not exists (
      select 1 from product_garment_types where product_id = p_product and garment_type_id = v_gt
    ) then
      raise exception 'garment_type_required:%', v_p.name;
    end if;
  end if;

  if exists (select 1 from product_variants where product_id = p_product and is_active)
     and not exists (
       select 1 from product_variants
       where product_id = p_product and is_active and id = nullif(p_config->>'variantId','')::uuid
     ) then
    raise exception 'variant_required:%', v_p.name;
  end if;

  for r in select o.id, o.name from product_options o where o.product_id = p_product and o.is_required loop
    if not exists (
      select 1 from product_option_values v
      where v.option_id = r.id and v.is_active
        and jsonb_typeof(p_config->'optionValueIds') = 'array'
        and v.id in (select x::uuid from jsonb_array_elements_text(p_config->'optionValueIds') x)
    ) then
      raise exception 'option_required:%', r.name;
    end if;
  end loop;

  for r in select a.id, a.name from customization_areas a
           where a.product_id = p_product and a.is_active and a.is_required loop
    if not coalesce((p_config->'areas'->(r.id::text)->>'enabled')::boolean, false) then
      raise exception 'area_required:%', r.name;
    end if;
  end loop;

  if v_p.product_type = 'simple' and cardinality(v_p.sizes) > 0
     and jsonb_typeof(p_config->'roster') = 'array' then
    if exists (
      select 1 from jsonb_array_elements(p_config->'roster') e
      where not (coalesce(e->>'size', '') = any (v_p.sizes))
    ) then
      raise exception 'invalid_size:%', v_p.name;
    end if;
  end if;

  select coalesce(array_agg(id), '{}') into v_kits from kit_items where kit_id = p_product;

  -- Loghi e sponsor liberi delle versioni precedenti (senza tecnica): regole di prima
  if p_config ? 'elements' and jsonb_typeof(p_config->'elements') <> 'array' then
    raise exception 'invalid_element';
  end if;
  select count(*) into v_n from jsonb_array_elements(v_els) e where coalesce(e->>'technique', '') = '';
  if v_n > 0 then
    if v_p.free_elements_max = 0 then raise exception 'elements_not_allowed:%', v_p.name; end if;
    if v_n > v_p.free_elements_max then raise exception 'too_many_elements:%:%', v_p.name, v_p.free_elements_max; end if;
    if exists (
      select 1 from jsonb_array_elements(v_els) e
      where coalesce(e->>'technique', '') = '' and (
         jsonb_typeof(e) <> 'object'
         or coalesce(e->>'kind', '') not in ('logo', 'sponsor')
         or not (coalesce(e->>'zone', '') = any (v_p.free_zones))
         or jsonb_typeof(e->'asset') <> 'object'
         or coalesce(e->'asset'->>'path', '') = ''
         or jsonb_typeof(e->'widthCm') <> 'number'
         or jsonb_typeof(e->'xCm') <> 'number'
         or jsonb_typeof(e->'yCm') <> 'number'
         or (e->>'widthCm')::numeric < v_p.free_min_width_cm
         or (e->>'widthCm')::numeric > v_p.free_max_width_cm
         or abs((e->>'xCm')::numeric) > 200
         or abs((e->>'yCm')::numeric) > 200)
    ) then
      raise exception 'invalid_element';
    end if;
  end if;

  -- Aree di stampa (con tecnica): forma dei dati
  if exists (
    select 1 from jsonb_array_elements(v_els) e
    where coalesce(e->>'technique', '') <> '' and (
         coalesce(e->>'kind', '') not in ('graphic', 'text', 'logo', 'sponsor')
         or coalesce(e->>'zone', '') not in ('front', 'back', 'sleeve_left', 'sleeve_right')
         or jsonb_typeof(e->'widthCm') <> 'number' or jsonb_typeof(e->'heightCm') <> 'number'
         or jsonb_typeof(e->'xCm') <> 'number' or jsonb_typeof(e->'yCm') <> 'number'
         or (e->>'widthCm')::numeric <= 0 or (e->>'heightCm')::numeric <= 0
         or (v_p.product_type = 'kit' and not (coalesce(e->>'kitItemId', '') <> '' and (e->>'kitItemId') = any (v_kits::text[])))
         or (v_p.product_type <> 'kit' and coalesce(e->>'kitItemId', '') <> '')
         or (e->>'kind' = 'text' and (char_length(trim(coalesce(e->>'text', ''))) not between 1 and 40))
         or (e->>'kind' <> 'text' and (jsonb_typeof(e->'asset') <> 'object' or coalesce(e->'asset'->>'path', '') = '')))
  ) then
    raise exception 'invalid_element';
  end if;

  -- zona, categoria, tecnica e numero massimo di aree
  for r in
    select e.value as el, z.*, t.code as t_code, t.is_active as t_active, t.all_over_only
    from jsonb_array_elements(v_els) e
    left join print_zones z on z.product_id = p_product and z.zone = e.value->>'zone'
      and z.kit_item_id is not distinct from nullif(e.value->>'kitItemId', '')::uuid
    left join print_techniques t on t.code = e.value->>'technique'
    where coalesce(e.value->>'technique', '') <> ''
  loop
    if r.id is null then raise exception 'zone_not_allowed:%', r.el->>'zone'; end if;
    if r.t_code is null or not r.t_active or not (r.t_code = any (r.techniques)) then
      raise exception 'technique_not_allowed:%', r.el->>'technique';
    end if;
    if r.all_over_only and not (v_p.all_over_enabled and (
         nullif(r.el->>'kitItemId', '') is null
         or exists (select 1 from kit_items k where k.id::text = r.el->>'kitItemId' and k.all_over_enabled))) then
      raise exception 'technique_not_allowed:%', r.el->>'technique';
    end if;
    if (r.el->>'kind' = 'text' and not r.allow_text) or (r.el->>'kind' <> 'text' and not r.allow_graphic) then
      raise exception 'category_not_allowed:%', r.el->>'zone';
    end if;
    -- dentro l'area massima (ingombro del rettangolo ruotato, tolleranza 0,05 cm)
    if not public.print_box_inside(r.el, r.x_cm, r.y_cm, r.width_cm, r.height_cm) then
      raise exception 'element_outside_zone:%', r.el->>'zone';
    end if;
  end loop;

  for r in
    select z.zone, z.max_items from jsonb_array_elements(v_els) e
    join print_zones z on z.product_id = p_product and z.zone = e->>'zone'
      and z.kit_item_id is not distinct from nullif(e->>'kitItemId', '')::uuid
    where coalesce(e->>'technique', '') <> ''
    group by z.id, z.zone, z.max_items having count(*) > z.max_items
  loop
    raise exception 'too_many_in_zone:%:%', r.zone, r.max_items;
  end loop;

  -- nessuna sovrapposizione tra aree della stessa zona
  if exists (
    select 1
    from jsonb_array_elements(v_els) with ordinality a(e, i)
    join jsonb_array_elements(v_els) with ordinality b(e, j) on a.i < b.j
    where coalesce(a.e->>'technique', '') <> '' and coalesce(b.e->>'technique', '') <> ''
      and a.e->>'zone' = b.e->>'zone' and coalesce(a.e->>'kitItemId', '') = coalesce(b.e->>'kitItemId', '')
      and public.print_boxes_overlap(a.e, b.e)
  ) then
    raise exception 'elements_overlap';
  end if;

  -- Grafica all-over
  if p_config ? 'allOver' and jsonb_typeof(p_config->'allOver') <> 'array' then
    raise exception 'invalid_all_over';
  end if;
  if jsonb_typeof(p_config->'allOver') = 'array' and jsonb_array_length(p_config->'allOver') > 0 then
    if not v_p.all_over_enabled then raise exception 'all_over_not_allowed:%', v_p.name; end if;
    if exists (
      select 1 from jsonb_array_elements(p_config->'allOver') e
      where jsonb_typeof(e) <> 'object'
         or jsonb_typeof(e->'asset') <> 'object'
         or coalesce(e->'asset'->>'path', '') = ''
         or (v_p.product_type = 'kit' and not (coalesce(e->>'kitItemId', '') <> ''
               and (e->>'kitItemId') = any (array(select id::text from kit_items where kit_id = p_product and all_over_enabled))))
         or (v_p.product_type <> 'kit' and coalesce(e->>'kitItemId', '') <> '')
         or (e ? 'overrides' and jsonb_typeof(e->'overrides') <> 'object')
         or exists (
           select 1 from jsonb_each(case when jsonb_typeof(e->'overrides') = 'object' then e->'overrides' else '{}'::jsonb end) o
           where o.key not in ('front', 'back', 'sleeve_left', 'sleeve_right', 'leg_left', 'leg_right')
              or jsonb_typeof(o.value) <> 'object'
              or coalesce(o.value->>'path', '') = ''
         )
         or (e ? 'colors' and jsonb_typeof(e->'colors') <> 'object')
         or exists (
           select 1 from jsonb_each_text(case when jsonb_typeof(e->'colors') = 'object' then e->'colors' else '{}'::jsonb end) c
           where c.key not in ('front', 'back', 'sleeve_left', 'sleeve_right', 'leg_left', 'leg_right')
              or c.value !~ '^#[0-9A-Fa-f]{6}$'
         )
    ) then
      raise exception 'invalid_all_over';
    end if;
    if (select count(distinct coalesce(e->>'kitItemId', '')) from jsonb_array_elements(p_config->'allOver') e)
       <> jsonb_array_length(p_config->'allOver') then
      raise exception 'invalid_all_over';
    end if;
  end if;

  -- Fasce
  if p_config ? 'bands' and jsonb_typeof(p_config->'bands') <> 'array' then
    raise exception 'invalid_band';
  end if;
  if jsonb_typeof(p_config->'bands') = 'array' and jsonb_array_length(p_config->'bands') > 0 then
    if exists (
      select 1 from jsonb_array_elements(p_config->'bands') b
      where jsonb_typeof(b) <> 'object'
         or coalesce(b->>'mode', '') not in ('color', 'graphic')
         or (b->>'mode' = 'color' and coalesce(b->>'color', '') !~ '^#[0-9A-Fa-f]{6}$')
         or (b->>'mode' = 'graphic' and (jsonb_typeof(b->'asset') <> 'object' or coalesce(b->'asset'->>'path', '') = ''))
         or (v_p.product_type = 'kit' and not exists (
               select 1 from kit_items k where k.kit_id = p_product and k.band_enabled and k.id::text = coalesce(b->>'kitItemId', '')))
         or (v_p.product_type <> 'kit' and (coalesce(b->>'kitItemId', '') <> '' or not v_p.band_enabled))
    ) then
      raise exception 'invalid_band';
    end if;
    if (select count(distinct coalesce(b->>'kitItemId', '')) from jsonb_array_elements(p_config->'bands') b)
       <> jsonb_array_length(p_config->'bands') then
      raise exception 'invalid_band';
    end if;
  end if;
end $$;

-- Ingombro (rettangolo allineato agli assi) di un elemento ruotato, in cm dal riferimento
create or replace function public.print_box(p_el jsonb, out x1 numeric, out y1 numeric, out x2 numeric, out y2 numeric)
language plpgsql immutable set search_path = public as $$
declare
  w numeric := (p_el->>'widthCm')::numeric;
  h numeric := (p_el->>'heightCm')::numeric;
  a double precision := radians(coalesce((p_el->>'rotation')::numeric, 0));
  hx numeric; hy numeric;
begin
  hx := (w * abs(cos(a)) + h * abs(sin(a))) / 2;
  hy := (w * abs(sin(a)) + h * abs(cos(a))) / 2;
  x1 := (p_el->>'xCm')::numeric - hx; x2 := (p_el->>'xCm')::numeric + hx;
  y1 := (p_el->>'yCm')::numeric - hy; y2 := (p_el->>'yCm')::numeric + hy;
end $$;

create or replace function public.print_box_inside(p_el jsonb, p_x numeric, p_y numeric, p_w numeric, p_h numeric)
returns boolean language sql immutable set search_path = public as $$
  select b.x1 >= p_x - 0.05 and b.y1 >= p_y - 0.05 and b.x2 <= p_x + p_w + 0.05 and b.y2 <= p_y + p_h + 0.05
  from public.print_box(p_el) b
$$;

create or replace function public.print_boxes_overlap(p_a jsonb, p_b jsonb)
returns boolean language sql immutable set search_path = public as $$
  select a.x1 < b.x2 - 0.05 and b.x1 < a.x2 - 0.05 and a.y1 < b.y2 - 0.05 and b.y1 < a.y2 - 0.05
  from public.print_box(p_a) a, public.print_box(p_b) b
$$;

-- Materializzazione ------------------------------------------------------------------------
create or replace function public.materialize_order_item(
  p_item uuid, p_product uuid, p_config jsonb, p_owner uuid, p_check_paths boolean
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_prefix text := coalesce(p_owner::text, '') || '/';
  v_els jsonb := case when jsonb_typeof(p_config->'elements') = 'array' then p_config->'elements' else '[]'::jsonb end;
begin
  if p_check_paths then
    -- Gli asset devono essere nella cartella del cliente o nella libreria pubblica
    if exists (
      select 1 from (
        select e.value->'asset' as a from jsonb_each(coalesce(p_config->'areas', '{}'::jsonb)) e
        union all
        select e->'asset' from jsonb_array_elements(v_els) e
        union all
        select e->'asset' from jsonb_array_elements(case when jsonb_typeof(p_config->'allOver') = 'array' then p_config->'allOver' else '[]'::jsonb end) e
        union all
        select o.value from jsonb_array_elements(case when jsonb_typeof(p_config->'allOver') = 'array' then p_config->'allOver' else '[]'::jsonb end) e,
          jsonb_each(case when jsonb_typeof(e->'overrides') = 'object' then e->'overrides' else '{}'::jsonb end) o
        union all
        select b->'asset' from jsonb_array_elements(case when jsonb_typeof(p_config->'bands') = 'array' then p_config->'bands' else '[]'::jsonb end) b
      ) x
      where jsonb_typeof(x.a) = 'object'
        and (
          x.a->>'path' like '%..%'
          or not (
            (x.a->>'bucket' = 'customer-uploads' and x.a->>'path' like v_prefix || '%')
            or (x.a->>'bucket' = 'public-media' and x.a->>'path' like 'assets/%')
          )
        )
    ) then
      raise exception 'invalid_asset_path';
    end if;
    if jsonb_typeof(p_config->'preview') = 'object' and exists (
      select 1 from jsonb_each_text(p_config->'preview') e
      where e.value is not null and (e.value like '%..%' or e.value not like v_prefix || '%')
    ) then
      raise exception 'invalid_preview_path';
    end if;
  end if;

  if p_product is not null then
    insert into order_item_customizations
      (order_item_id, area_id, area_name, area_type, side, asset_path, asset_bucket, asset_meta)
    select p_item, a.id, a.name, a.area_type, a.side,
           e.value->'asset'->>'path',
           e.value->'asset'->>'bucket',
           coalesce(e.value->'asset', '{}'::jsonb) - 'path' - 'bucket'
    from jsonb_each(coalesce(p_config->'areas', '{}'::jsonb)) e
    join customization_areas a on a.id = e.key::uuid and a.product_id = p_product
    where coalesce((e.value->>'enabled')::boolean, false)
    order by a.sort_order;
  end if;

  -- Loghi, sponsor, grafiche e testi posizionati dal cliente: misure in cm e tecnica
  insert into order_item_customizations
    (order_item_id, area_name, area_type, side, asset_path, asset_bucket, asset_meta)
  select p_item,
         case x.e->>'kind' when 'sponsor' then 'Sponsor ' when 'text' then 'Testo ' when 'graphic' then 'Grafica ' else 'Logo ' end
           || row_number() over (partition by x.e->>'kind' order by x.ord),
         (case x.e->>'kind' when 'sponsor' then 'sponsor' when 'text' then 'text' else 'logo' end)::area_type,
         case when x.e->>'zone' in ('front', 'back') then (x.e->>'zone')::area_side end,
         x.e->'asset'->>'path',
         x.e->'asset'->>'bucket',
         (coalesce(x.e->'asset', '{}'::jsonb) - 'path' - 'bucket') || jsonb_strip_nulls(jsonb_build_object(
           'free', true,
           'zone', x.e->>'zone',
           'kitItemId', x.e->>'kitItemId',
           'xCm', x.e->'xCm', 'yCm', x.e->'yCm', 'widthCm', x.e->'widthCm', 'heightCm', x.e->'heightCm',
           'rotation', coalesce(x.e->'rotation', '0'::jsonb),
           'technique', x.e->>'technique',
           'text', x.e->>'text', 'font', x.e->>'font', 'color', x.e->>'color',
           'price', case when p_product is not null then public.print_element_price(p_product, x.e) end
         ))
  from jsonb_array_elements(v_els) with ordinality as x(e, ord)
  order by x.ord;

  -- Grafica all-over: una riga per capo/componente, una per ogni sostituzione e per ogni colore
  if jsonb_typeof(p_config->'allOver') = 'array' then
    insert into order_item_customizations
      (order_item_id, area_name, area_type, side, asset_path, asset_bucket, asset_meta)
    select p_item, left(x.name, 80), 'all_over'::area_type, x.side, x.a->>'path', x.a->>'bucket',
           (coalesce(x.a, '{}'::jsonb) - 'path' - 'bucket') || jsonb_strip_nulls(jsonb_build_object('allOver', true, 'zone', x.zone, 'kitItemId', x.kit, 'color', x.color))
    from (
      select e.ord, 0 as sub, 'Grafica all-over'
               || coalesce(' · ' || (select k.label from kit_items k where k.id::text = e.v->>'kitItemId'), '') as name,
             null::area_side as side, e.v->'asset' as a, null::text as zone, e.v->>'kitItemId' as kit, null::text as color
      from jsonb_array_elements(p_config->'allOver') with ordinality as e(v, ord)
      union all
      select e.ord, 1, 'Grafica all-over'
               || coalesce(' · ' || (select k.label from kit_items k where k.id::text = e.v->>'kitItemId'), '')
               || ' · ' || public.section_label(o.key),
             case when o.key in ('front', 'back') then o.key::area_side end, o.value, o.key, e.v->>'kitItemId', null
      from jsonb_array_elements(p_config->'allOver') with ordinality as e(v, ord),
           jsonb_each(case when jsonb_typeof(e.v->'overrides') = 'object' then e.v->'overrides' else '{}'::jsonb end) o
      union all
      select e.ord, 2, 'Colore'
               || coalesce(' · ' || (select k.label from kit_items k where k.id::text = e.v->>'kitItemId'), '')
               || ' · ' || public.section_label(c.key),
             case when c.key in ('front', 'back') then c.key::area_side end, null, c.key, e.v->>'kitItemId', c.value
      from jsonb_array_elements(p_config->'allOver') with ordinality as e(v, ord),
           jsonb_each_text(case when jsonb_typeof(e.v->'colors') = 'object' then e.v->'colors' else '{}'::jsonb end) c
    ) x
    order by x.ord, x.sub, x.zone;
  end if;

  -- Fasce
  if jsonb_typeof(p_config->'bands') = 'array' then
    insert into order_item_customizations
      (order_item_id, area_name, area_type, side, asset_path, asset_bucket, asset_meta)
    select p_item,
           left('Fascia' || coalesce(' · ' || (select k.label from kit_items k where k.id::text = b.v->>'kitItemId'), ''), 80),
           'all_over'::area_type, null, b.v->'asset'->>'path', b.v->'asset'->>'bucket',
           (coalesce(b.v->'asset', '{}'::jsonb) - 'path' - 'bucket') || jsonb_strip_nulls(jsonb_build_object(
             'band', true, 'mode', b.v->>'mode', 'color', b.v->>'color', 'kitItemId', b.v->>'kitItemId'))
    from jsonb_array_elements(p_config->'bands') with ordinality as b(v, ord)
    order by b.ord;
  end if;

  -- Aree libere (ordini custom creati dall'admin senza prodotto a catalogo)
  if jsonb_typeof(p_config->'customAreas') = 'array' then
    insert into order_item_customizations
      (order_item_id, area_name, area_type, side, asset_path, asset_bucket, asset_meta)
    select p_item,
           left(coalesce(e->>'name', 'Personalizzazione'), 80),
           coalesce(nullif(e->>'type', ''), 'logo')::area_type,
           coalesce(nullif(e->>'side', ''), 'front')::area_side,
           e->'asset'->>'path',
           e->'asset'->>'bucket',
           jsonb_strip_nulls(jsonb_build_object('note', e->>'note', 'technique', e->>'technique',
             'widthCm', e->'widthCm', 'heightCm', e->'heightCm', 'xCm', e->'xCm', 'yCm', e->'yCm', 'rotation', e->'rotation'))
    from jsonb_array_elements(p_config->'customAreas') e;
  end if;

  if jsonb_typeof(p_config->'roster') = 'array' then
    insert into order_item_roster (order_item_id, position, player_name, player_number, size, sizes, quantity)
    select p_item, (r.ord - 1)::int,
           nullif(left(coalesce(r.e->>'name', ''), 40), ''),
           nullif(left(coalesce(r.e->>'number', ''), 4), ''),
           nullif(left(coalesce(r.e->>'size', ''), 16), ''),
           case when jsonb_typeof(r.e->'sizes') = 'object' then r.e->'sizes' else '{}'::jsonb end,
           greatest(coalesce((r.e->>'quantity')::int, 1), 1)
    from jsonb_array_elements(p_config->'roster') with ordinality as r(e, ord);
  end if;
end $$;
revoke all on function public.materialize_order_item(uuid, uuid, jsonb, uuid, boolean) from public, anon, authenticated;

create or replace function public.section_label(p_key text)
returns text language sql immutable set search_path = public as $$
  select case p_key when 'front' then 'davanti' when 'back' then 'dietro' when 'sleeve_left' then 'manica sinistra'
                    when 'sleeve_right' then 'manica destra' when 'leg_left' then 'gamba sinistra'
                    when 'leg_right' then 'gamba destra' else p_key end
$$;

-- Duplicazione prodotto: copia anche zone di stampa e fasce --------------------------------
create or replace function public.admin_duplicate_product(p_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_new     uuid;
  v_slug    text;
  v_new_opt uuid;
  v_new_kit uuid;
  v_kit_map jsonb := '{}'::jsonb;
  r         record;
begin
  perform public.assert_admin();
  select slug || '-copia' into v_slug from products where id = p_id;
  if v_slug is null then raise exception 'product_not_found'; end if;
  while exists (select 1 from products where slug = v_slug) loop
    v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4);
  end loop;

  insert into products (category_id, name, slug, short_description, description, product_type, base_price,
    availability, is_configurable, model_shape, sizes, min_quantity, attributes, is_published, sort_order,
    seo_title, seo_description, supply_mode, all_over_enabled, all_over_price, band_enabled, band_height_cm, band_price)
  select category_id, left(name || ' (copia)', 160), v_slug, short_description, description, product_type, base_price,
    availability, is_configurable, model_shape, sizes, min_quantity, attributes, false, sort_order,
    seo_title, seo_description, supply_mode, all_over_enabled, all_over_price, band_enabled, band_height_cm, band_price
  from products where id = p_id
  returning id into v_new;

  insert into product_garment_types (product_id, garment_type_id, price_delta, sort_order)
  select v_new, garment_type_id, price_delta, sort_order from product_garment_types where product_id = p_id;

  insert into product_variants (product_id, name, color_hex, secondary_hex, sku, price_delta, sort_order, is_active)
  select v_new, name, color_hex, secondary_hex, null, price_delta, sort_order, is_active
  from product_variants where product_id = p_id;

  for r in select * from product_options where product_id = p_id loop
    insert into product_options (product_id, name, help_text, is_required, is_multiple, sort_order)
    values (v_new, r.name, r.help_text, r.is_required, r.is_multiple, r.sort_order)
    returning id into v_new_opt;
    insert into product_option_values (option_id, label, price_delta, color_hex, sort_order, is_active)
    select v_new_opt, label, price_delta, color_hex, sort_order, is_active
    from product_option_values where option_id = r.id;
  end loop;

  for r in select * from kit_items where kit_id = p_id loop
    insert into kit_items (kit_id, component_product_id, label, model_shape, quantity, sizes, sort_order, all_over_enabled,
      band_enabled, band_height_cm, band_price)
    values (v_new, r.component_product_id, r.label, r.model_shape, r.quantity, r.sizes, r.sort_order, r.all_over_enabled,
      r.band_enabled, r.band_height_cm, r.band_price)
    returning id into v_new_kit;
    v_kit_map := v_kit_map || jsonb_build_object(r.id::text, v_new_kit);
  end loop;

  insert into customization_areas (product_id, kit_item_id, name, side, area_type, x, y, width, height,
    print_width_cm, print_height_cm, price_delta, max_chars, is_required, allow_library, allow_upload, sort_order, is_active)
  select v_new, (v_kit_map->>(kit_item_id::text))::uuid, name, side, area_type, x, y, width, height,
    print_width_cm, print_height_cm, price_delta, max_chars, is_required, allow_library, allow_upload, sort_order, is_active
  from customization_areas where product_id = p_id;

  insert into print_zones (product_id, kit_item_id, zone, x_cm, y_cm, width_cm, height_cm, max_items, allow_graphic, allow_text, techniques, sort_order)
  select v_new, (v_kit_map->>(kit_item_id::text))::uuid, zone, x_cm, y_cm, width_cm, height_cm, max_items, allow_graphic, allow_text, techniques, sort_order
  from print_zones where product_id = p_id;

  insert into price_tiers (product_id, min_quantity, discount_percent)
  select v_new, min_quantity, discount_percent from price_tiers where product_id = p_id;

  return v_new;
end $$;
