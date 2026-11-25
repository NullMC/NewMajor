-- Nuovi modelli 3D, grafica all-over e immagini per colore.
--
-- 1. model_shape: polo, felpa con cappuccio, giacca e pantalone tuta, giubbotto.
--    (L'aggiunta di valori a un enum non è annullabile; i nuovi valori non sono usati qui.)
-- 2. Grafica all-over scelta dal cliente: copre l'intero capo, per capo o per componente del
--    kit, con sostituzioni facoltative per singolo pezzo.
--    Configurazione: allOver: [{ kitItemId?, asset: { bucket, path, … },
--                                overrides?: { front?|back?|sleeve_left?|sleeve_right?: asset } }]
--    Prezzo: products.all_over_price per ogni voce (deciso dall'admin, default 0).
-- 3. product_images.variant_id: immagine associata a un colore (null = tutti i colori).

alter type public.model_shape add value if not exists 'polo';
alter type public.model_shape add value if not exists 'hoodie';
alter type public.model_shape add value if not exists 'track_jacket';
alter type public.model_shape add value if not exists 'track_pants';
alter type public.model_shape add value if not exists 'jacket';

alter table public.products
  add column all_over_enabled boolean not null default false,
  add column all_over_price   numeric(10,2) not null default 0 check (all_over_price >= 0);

alter table public.product_images
  add column variant_id uuid references public.product_variants(id) on delete set null;
create index product_images_variant_idx on public.product_images(variant_id) where variant_id is not null;

-- il colore deve appartenere allo stesso prodotto dell'immagine
create or replace function public.product_images_check_variant()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.variant_id is not null and not exists (
    select 1 from product_variants where id = new.variant_id and product_id = new.product_id
  ) then
    raise exception 'image_variant_mismatch';
  end if;
  return new;
end $$;
create trigger product_images_check_variant
  before insert or update of variant_id, product_id on public.product_images
  for each row execute function public.product_images_check_variant();

-- Prezzo unitario: + prezzo all-over per ogni capo/componente con grafica all-over ----------
create or replace function public.compute_unit_price(p_product uuid, p_config jsonb)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_price   numeric(12,2);
  v_logo    numeric(10,2);
  v_sponsor numeric(10,2);
  v_all     numeric(10,2);
  v_gt      uuid := nullif(p_config->>'garmentTypeId', '')::uuid;
  v_variant uuid := nullif(p_config->>'variantId', '')::uuid;
begin
  if not (public.product_is_visible(p_product) or public.is_admin()) then
    raise exception 'product_not_found';
  end if;

  select base_price, free_logo_price, free_sponsor_price, all_over_price into v_price, v_logo, v_sponsor, v_all from products where id = p_product;
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
    v_price := v_price
      + v_logo * (select count(*) from jsonb_array_elements(p_config->'elements') e where e->>'kind' = 'logo')
      + v_sponsor * (select count(*) from jsonb_array_elements(p_config->'elements') e where e->>'kind' = 'sponsor');
  end if;

  if jsonb_typeof(p_config->'allOver') = 'array' then
    v_price := v_price + v_all * jsonb_array_length(p_config->'allOver');
  end if;

  return round(v_price, 2);
end $$;

-- Validazione: regole della grafica all-over ----------------------------------------------
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
    select coalesce(array_agg(id), '{}') into v_kits from kit_items where kit_id = p_product;
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

-- Materializzazione: percorsi e righe della grafica all-over -------------------------------
create or replace function public.materialize_order_item(
  p_item uuid, p_product uuid, p_config jsonb, p_owner uuid, p_check_paths boolean
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_prefix text := coalesce(p_owner::text, '') || '/';
begin
  if p_check_paths then
    -- Gli asset devono essere nella cartella del cliente o nella libreria pubblica
    if exists (
      select 1 from (
        select e.value->'asset' as a from jsonb_each(coalesce(p_config->'areas', '{}'::jsonb)) e
        union all
        select e->'asset' from jsonb_array_elements(case when jsonb_typeof(p_config->'elements') = 'array' then p_config->'elements' else '[]'::jsonb end) e
        union all
        select e->'asset' from jsonb_array_elements(case when jsonb_typeof(p_config->'allOver') = 'array' then p_config->'allOver' else '[]'::jsonb end) e
        union all
        select o.value from jsonb_array_elements(case when jsonb_typeof(p_config->'allOver') = 'array' then p_config->'allOver' else '[]'::jsonb end) e,
          jsonb_each(case when jsonb_typeof(e->'overrides') = 'object' then e->'overrides' else '{}'::jsonb end) o
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

  -- Loghi e sponsor liberi: posizione in cm rispetto al riferimento del pezzo
  if jsonb_typeof(p_config->'elements') = 'array' then
    insert into order_item_customizations
      (order_item_id, area_name, area_type, side, asset_path, asset_bucket, asset_meta)
    select p_item,
           case when x.e->>'kind' = 'sponsor' then 'Sponsor ' else 'Logo ' end
             || row_number() over (partition by x.e->>'kind' order by x.ord),
           (x.e->>'kind')::area_type,
           case when x.e->>'zone' in ('front', 'back') then (x.e->>'zone')::area_side end,
           x.e->'asset'->>'path',
           x.e->'asset'->>'bucket',
           (coalesce(x.e->'asset', '{}'::jsonb) - 'path' - 'bucket') || jsonb_build_object(
             'free', true,
             'zone', x.e->>'zone',
             'kitItemId', x.e->>'kitItemId',
             'xCm', x.e->'xCm', 'yCm', x.e->'yCm', 'widthCm', x.e->'widthCm',
             'rotation', coalesce(x.e->'rotation', '0'::jsonb)
           )
    from jsonb_array_elements(p_config->'elements') with ordinality as x(e, ord)
    order by x.ord;
  end if;

  -- Grafica all-over: una riga per capo/componente e una per ogni sostituzione di pezzo
  if jsonb_typeof(p_config->'allOver') = 'array' then
    insert into order_item_customizations
      (order_item_id, area_name, area_type, side, asset_path, asset_bucket, asset_meta)
    select p_item, left(x.name, 80), 'all_over'::area_type, x.side, x.a->>'path', x.a->>'bucket',
           (coalesce(x.a, '{}'::jsonb) - 'path' - 'bucket') || jsonb_build_object('allOver', true, 'zone', x.zone, 'kitItemId', x.kit)
    from (
      select e.ord, 0 as sub, 'Grafica all-over'
               || coalesce(' · ' || (select k.label from kit_items k where k.id::text = e.v->>'kitItemId'), '') as name,
             null::area_side as side, e.v->'asset' as a, null::text as zone, e.v->>'kitItemId' as kit
      from jsonb_array_elements(p_config->'allOver') with ordinality as e(v, ord)
      union all
      select e.ord, 1, 'Grafica all-over'
               || coalesce(' · ' || (select k.label from kit_items k where k.id::text = e.v->>'kitItemId'), '')
               || ' · ' || case o.key when 'front' then 'davanti' when 'back' then 'dietro'
                                      when 'sleeve_left' then 'manica sinistra' else 'manica destra' end,
             case when o.key in ('front', 'back') then o.key::area_side end, o.value, o.key, e.v->>'kitItemId'
      from jsonb_array_elements(p_config->'allOver') with ordinality as e(v, ord),
           jsonb_each(case when jsonb_typeof(e.v->'overrides') = 'object' then e.v->'overrides' else '{}'::jsonb end) o
    ) x
    order by x.ord, x.sub, x.zone;
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
           jsonb_build_object('note', e->>'note')
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
