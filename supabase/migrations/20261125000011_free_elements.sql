-- Loghi e sponsor liberi: il cliente può aggiungerne più d'uno e posizionarli su davanti,
-- dietro e maniche. Le posizioni sono in centimetri rispetto al punto di riferimento del pezzo
-- (cartamodello della taglia di riferimento), così valgono 1:1 nel file di produzione.
--
-- Configurazione (cart_items / order_items.configuration):
--   elements: [{ id, kind: 'logo'|'sponsor', zone: 'front'|'back'|'sleeve_left'|'sleeve_right',
--                kitItemId?, asset: { bucket, path, … }, xCm, yCm, widthCm, rotation }]

alter table public.products
  add column free_elements_max  integer not null default 0 check (free_elements_max between 0 and 30),
  add column free_logo_price    numeric(10,2) not null default 0 check (free_logo_price >= 0),
  add column free_sponsor_price numeric(10,2) not null default 0 check (free_sponsor_price >= 0),
  add column free_min_width_cm  numeric(6,2) not null default 2 check (free_min_width_cm > 0),
  add column free_max_width_cm  numeric(6,2) not null default 40 check (free_max_width_cm > 0),
  add column free_zones         text[] not null default '{front,back,sleeve_left,sleeve_right}'
    check (free_zones <@ array['front', 'back', 'sleeve_left', 'sleeve_right']);

-- Pezzi della taglia di riferimento usati dal configuratore per posizionare le grafiche.
-- Espone solo davanti, dietro e maniche della taglia di riferimento dei prodotti visibili.
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
      and p.piece in ('front', 'back', 'sleeve_left', 'sleeve_right')
  ), '[]'::jsonb);
end $$;
revoke all on function public.product_print_zones(uuid) from public;
grant execute on function public.product_print_zones(uuid) to anon, authenticated;

-- Prezzo unitario: + prezzo per ogni logo e sponsor libero -----------------------------
create or replace function public.compute_unit_price(p_product uuid, p_config jsonb)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_price   numeric(12,2);
  v_logo    numeric(10,2);
  v_sponsor numeric(10,2);
  v_gt      uuid := nullif(p_config->>'garmentTypeId', '')::uuid;
  v_variant uuid := nullif(p_config->>'variantId', '')::uuid;
begin
  if not (public.product_is_visible(p_product) or public.is_admin()) then
    raise exception 'product_not_found';
  end if;

  select base_price, free_logo_price, free_sponsor_price into v_price, v_logo, v_sponsor from products where id = p_product;
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

  return round(v_price, 2);
end $$;

-- Validazione: regole degli elementi liberi ---------------------------------------------
create or replace function public.validate_configuration(p_product uuid, p_config jsonb, p_quantity integer)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  v_p products%rowtype;
  v_gt uuid := nullif(p_config->>'garmentTypeId', '')::uuid;
  v_n integer := 0;
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
end $$;

-- Materializzazione: percorsi degli elementi controllati e una riga per elemento ---------
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
