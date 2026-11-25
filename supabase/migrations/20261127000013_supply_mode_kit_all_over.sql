-- Fornitura dei prodotti e grafica all-over per componente del kit.
--
-- 1. products.supply_mode: 'immediate' (disponibilità immediata, a magazzino) oppure 'on_demand'
--    (print-on-demand: non stoccato, ordinato al fornitore al momento dell'ordine). Il catalogo
--    è diviso in queste due sezioni.
-- 2. order_items.supply_mode: copia della fornitura al momento dell'ordine (trigger), così
--    l'admin sa cosa ordinare al fornitore anche se il prodotto cambia in seguito.
-- 3. kit_items.all_over_enabled: componenti del kit su cui è consentita la grafica all-over
--    (oltre all'interruttore del prodotto). Default true: i kit esistenti non cambiano.

create type public.supply_mode as enum ('immediate', 'on_demand');

alter table public.products
  add column supply_mode public.supply_mode not null default 'immediate';
create index products_supply_idx on public.products(supply_mode) where deleted_at is null;

alter table public.order_items
  add column supply_mode public.supply_mode;

create or replace function public.order_items_set_supply()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.product_id is not null then
    select supply_mode into new.supply_mode from products where id = new.product_id;
  end if;
  return new;
end $$;
revoke all on function public.order_items_set_supply() from public, anon, authenticated;
create trigger order_items_set_supply
  before insert on public.order_items
  for each row execute function public.order_items_set_supply();

alter table public.kit_items
  add column all_over_enabled boolean not null default true;

-- Validazione: all-over solo sui componenti abilitati -------------------------------------
create or replace function public.validate_configuration(p_product uuid, p_config jsonb, p_quantity integer)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  v_p products%rowtype;
  v_gt uuid := nullif(p_config->>'garmentTypeId', '')::uuid;
  v_n integer := 0;
  v_kits uuid[];
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

  -- Taglie del roster ammesse (solo prodotti semplici con taglie definite)
  if v_p.product_type = 'simple' and cardinality(v_p.sizes) > 0
     and jsonb_typeof(p_config->'roster') = 'array' then
    if exists (
      select 1 from jsonb_array_elements(p_config->'roster') e
      where not (coalesce(e->>'size', '') = any (v_p.sizes))
    ) then
      raise exception 'invalid_size:%', v_p.name;
    end if;
  end if;

  -- Loghi e sponsor liberi
  if p_config ? 'elements' and jsonb_typeof(p_config->'elements') <> 'array' then
    raise exception 'invalid_element';
  end if;
  if jsonb_typeof(p_config->'elements') = 'array' then
    v_n := jsonb_array_length(p_config->'elements');
  end if;
  if v_n > 0 then
    if v_p.free_elements_max = 0 then raise exception 'elements_not_allowed:%', v_p.name; end if;
    if v_n > v_p.free_elements_max then raise exception 'too_many_elements:%:%', v_p.name, v_p.free_elements_max; end if;
    if exists (
      select 1 from jsonb_array_elements(p_config->'elements') e
      where jsonb_typeof(e) <> 'object'
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
         or abs((e->>'yCm')::numeric) > 200
    ) then
      raise exception 'invalid_element';
    end if;
  end if;

  -- Grafica all-over: una per capo (o per componente del kit), sostituzioni facoltative per pezzo
  if p_config ? 'allOver' and jsonb_typeof(p_config->'allOver') <> 'array' then
    raise exception 'invalid_all_over';
  end if;
  if jsonb_typeof(p_config->'allOver') = 'array' and jsonb_array_length(p_config->'allOver') > 0 then
    if not v_p.all_over_enabled then raise exception 'all_over_not_allowed:%', v_p.name; end if;
    -- solo i componenti su cui l'admin consente l'all-over
    select coalesce(array_agg(id), '{}') into v_kits from kit_items where kit_id = p_product and all_over_enabled;
    if exists (
      select 1 from jsonb_array_elements(p_config->'allOver') e
      where jsonb_typeof(e) <> 'object'
         or jsonb_typeof(e->'asset') <> 'object'
         or coalesce(e->'asset'->>'path', '') = ''
         -- componente: obbligatorio e del prodotto per i kit, assente per i capi singoli
         or (v_p.product_type = 'kit' and not (coalesce(e->>'kitItemId', '') <> '' and (e->>'kitItemId') = any (v_kits::text[])))
         or (v_p.product_type <> 'kit' and coalesce(e->>'kitItemId', '') <> '')
         or (e ? 'overrides' and jsonb_typeof(e->'overrides') <> 'object')
         or exists (
           select 1 from jsonb_each(case when jsonb_typeof(e->'overrides') = 'object' then e->'overrides' else '{}'::jsonb end) o
           where o.key not in ('front', 'back', 'sleeve_left', 'sleeve_right')
              or jsonb_typeof(o.value) <> 'object'
              or coalesce(o.value->>'path', '') = ''
         )
    ) then
      raise exception 'invalid_all_over';
    end if;
    if (select count(distinct coalesce(e->>'kitItemId', '')) from jsonb_array_elements(p_config->'allOver') e)
       <> jsonb_array_length(p_config->'allOver') then
      raise exception 'invalid_all_over';
    end if;
  end if;
end $$;

-- Duplicazione prodotto: copia anche fornitura, all-over e componenti abilitati -----------
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
    seo_title, seo_description, supply_mode, all_over_enabled, all_over_price)
  select category_id, left(name || ' (copia)', 160), v_slug, short_description, description, product_type, base_price,
    availability, is_configurable, model_shape, sizes, min_quantity, attributes, false, sort_order,
    seo_title, seo_description, supply_mode, all_over_enabled, all_over_price
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
    insert into kit_items (kit_id, component_product_id, label, model_shape, quantity, sizes, sort_order, all_over_enabled)
    values (v_new, r.component_product_id, r.label, r.model_shape, r.quantity, r.sizes, r.sort_order, r.all_over_enabled)
    returning id into v_new_kit;
    v_kit_map := v_kit_map || jsonb_build_object(r.id::text, v_new_kit);
  end loop;

  insert into customization_areas (product_id, kit_item_id, name, side, area_type, x, y, width, height,
    print_width_cm, print_height_cm, price_delta, max_chars, is_required, allow_library, allow_upload, sort_order, is_active)
  select v_new, (v_kit_map->>(kit_item_id::text))::uuid, name, side, area_type, x, y, width, height,
    print_width_cm, print_height_cm, price_delta, max_chars, is_required, allow_library, allow_upload, sort_order, is_active
  from customization_areas where product_id = p_id;

  insert into price_tiers (product_id, min_quantity, discount_percent)
  select v_new, min_quantity, discount_percent from price_tiers where product_id = p_id;

  return v_new;
end $$;
