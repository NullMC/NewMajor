-- =============================================================================
-- New Major — Funzioni di business (RPC)
-- =============================================================================
-- Tutti i prezzi degli ordini vengono ricalcolati lato database: il valore
-- mostrato dal client è solo indicativo e non viene mai accettato come tale.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Prezzi
-- -----------------------------------------------------------------------------
-- Quantità totale di una configurazione: somma delle righe del roster (nomi/numeri/taglie)
create or replace function public.config_quantity(p_config jsonb, p_fallback integer)
returns integer language sql immutable as $$
  select case
    when jsonb_typeof(p_config->'roster') = 'array' and jsonb_array_length(p_config->'roster') > 0 then (
      select coalesce(sum(greatest(coalesce((e->>'quantity')::int, 1), 1)), 0)::int
      from jsonb_array_elements(p_config->'roster') e
    )
    else greatest(coalesce(p_fallback, 1), 1)
  end;
$$;

-- Prezzo unitario: base + tipologia capo + variante + opzioni + aree di personalizzazione usate
create or replace function public.compute_unit_price(p_product uuid, p_config jsonb)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_price   numeric(12,2);
  v_gt      uuid := nullif(p_config->>'garmentTypeId', '')::uuid;
  v_variant uuid := nullif(p_config->>'variantId', '')::uuid;
begin
  if not (public.product_is_visible(p_product) or public.is_admin()) then
    raise exception 'product_not_found';
  end if;

  select base_price into v_price from products where id = p_product;
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

  return round(v_price, 2);
end $$;

-- Totale riga con sconto a scaglioni
create or replace function public.compute_line_total(p_product uuid, p_config jsonb, p_quantity integer)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_unit numeric(12,2) := public.compute_unit_price(p_product, p_config);
  v_disc numeric(5,2);
begin
  select coalesce(max(discount_percent), 0) into v_disc
  from price_tiers where product_id = p_product and min_quantity <= p_quantity;
  return round(v_unit * p_quantity * (1 - v_disc / 100), 2);
end $$;

grant execute on function public.compute_unit_price(uuid, jsonb) to anon, authenticated;
grant execute on function public.compute_line_total(uuid, jsonb, integer) to anon, authenticated;

-- Validazione della configurazione rispetto alle regole del prodotto
create or replace function public.validate_configuration(p_product uuid, p_config jsonb, p_quantity integer)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  v_p products%rowtype;
  v_gt uuid := nullif(p_config->>'garmentTypeId', '')::uuid;
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
end $$;

-- -----------------------------------------------------------------------------
-- Riferimento ordine: NM26-00001
-- -----------------------------------------------------------------------------
create or replace function public.next_order_reference()
returns text language sql volatile security definer set search_path = public as $$
  select 'NM' || to_char(now() at time zone 'Europe/Rome', 'YY') || '-'
         || lpad(nextval('public.order_reference_seq')::text, 5, '0');
$$;
revoke all on function public.next_order_reference() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Materializza personalizzazioni e roster di una riga ordine
-- -----------------------------------------------------------------------------
create or replace function public.materialize_order_item(
  p_item uuid, p_product uuid, p_config jsonb, p_owner uuid, p_check_paths boolean
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_prefix text := coalesce(p_owner::text, '') || '/';
begin
  if p_check_paths then
    -- Gli asset devono essere nella cartella del cliente o nella libreria pubblica
    if exists (
      select 1 from jsonb_each(coalesce(p_config->'areas', '{}'::jsonb)) e
      where jsonb_typeof(e.value->'asset') = 'object'
        and (
          e.value->'asset'->>'path' like '%..%'
          or not (
            (e.value->'asset'->>'bucket' = 'customer-uploads' and e.value->'asset'->>'path' like v_prefix || '%')
            or (e.value->'asset'->>'bucket' = 'public-media' and e.value->'asset'->>'path' like 'assets/%')
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

-- -----------------------------------------------------------------------------
-- Notifiche helper
-- -----------------------------------------------------------------------------
create or replace function public.notify_admins(p_type notification_type, p_title text, p_message text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, type, title, message, link)
  select id, p_type, left(p_title, 160), left(p_message, 4000), p_link
  from profiles where role = 'admin' and is_active;
$$;
revoke all on function public.notify_admins(notification_type, text, text, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Checkout cliente
-- -----------------------------------------------------------------------------
create or replace function public.place_order(
  p_payment_method  payment_method,
  p_shipping_address jsonb,
  p_billing_address  jsonb default null,
  p_customer         jsonb default '{}'::jsonb,
  p_notes            text default null
) returns table (order_id uuid, reference text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_uid       uuid := auth.uid();
  v_profile   profiles%rowtype;
  v_cart      uuid;
  v_order     uuid;
  v_ref       text;
  v_status    uuid;
  v_subtotal  numeric(12,2) := 0;
  v_shipping  numeric(12,2);
  v_ship_cfg  jsonb;
  v_item      record;
  v_qty       integer;
  v_unit      numeric(12,2);
  v_line      numeric(12,2);
  v_oi        uuid;
  v_name      text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_profile from profiles where id = v_uid;
  if not found or not v_profile.is_active then raise exception 'account_disabled'; end if;

  if coalesce(trim(p_shipping_address->>'full_name'), '') = ''
     or coalesce(trim(p_shipping_address->>'line1'), '') = ''
     or coalesce(trim(p_shipping_address->>'city'), '') = ''
     or coalesce(trim(p_shipping_address->>'postal_code'), '') = '' then
    raise exception 'invalid_shipping_address';
  end if;

  select id into v_cart from carts where user_id = v_uid;
  if v_cart is null or not exists (select 1 from cart_items where cart_id = v_cart) then
    raise exception 'empty_cart';
  end if;

  select id into v_status from order_statuses
  where is_active and is_initial order by sort_order limit 1;
  if v_status is null then
    select id into v_status from order_statuses
    where is_active and not is_cancelled order by sort_order limit 1;
  end if;
  if v_status is null then raise exception 'no_order_status_configured'; end if;

  v_name := coalesce(nullif(trim(p_customer->>'name'), ''), v_profile.full_name, p_shipping_address->>'full_name');
  v_ref := public.next_order_reference();

  insert into orders (
    reference, user_id, kind, status_id, payment_method, payment_status,
    customer_name, customer_email, customer_phone,
    shipping_address, billing_address, customer_notes, created_by
  ) values (
    v_ref, v_uid, 'order', v_status, p_payment_method,
    case when p_payment_method = 'bank_transfer' then 'awaiting_transfer'::payment_status else 'pending'::payment_status end,
    left(v_name, 160),
    coalesce(nullif(trim(p_customer->>'email'), ''), v_profile.email),
    left(coalesce(nullif(trim(p_customer->>'phone'), ''), v_profile.phone, p_shipping_address->>'phone'), 40),
    p_shipping_address, p_billing_address, left(p_notes, 2000), v_uid
  ) returning id into v_order;

  for v_item in
    select ci.id, ci.product_id, ci.configuration, ci.quantity,
           p.name, p.slug, p.is_published, p.deleted_at, p.availability, p.product_type, p.base_price
    from cart_items ci join products p on p.id = ci.product_id
    where ci.cart_id = v_cart
    order by ci.created_at
  loop
    if not v_item.is_published or v_item.deleted_at is not null then
      raise exception 'product_unavailable:%', v_item.name;
    end if;
    if v_item.availability = 'out_of_stock' then
      raise exception 'product_out_of_stock:%', v_item.name;
    end if;

    v_qty := public.config_quantity(v_item.configuration, v_item.quantity);
    perform public.validate_configuration(v_item.product_id, v_item.configuration, v_qty);
    v_unit := public.compute_unit_price(v_item.product_id, v_item.configuration);
    v_line := public.compute_line_total(v_item.product_id, v_item.configuration, v_qty);

    insert into order_items (order_id, product_id, product_name, product_snapshot, configuration, quantity, unit_price, line_total)
    values (
      v_order, v_item.product_id, v_item.name,
      jsonb_build_object('slug', v_item.slug, 'product_type', v_item.product_type, 'base_price', v_item.base_price),
      v_item.configuration, v_qty, v_unit, v_line
    ) returning id into v_oi;

    perform public.materialize_order_item(v_oi, v_item.product_id, v_item.configuration, v_uid, true);
    v_subtotal := v_subtotal + v_line;
  end loop;

  -- Spedizione: configurabile da backoffice (settings.shipping)
  select value into v_ship_cfg from settings where key = 'shipping';
  if v_ship_cfg->>'mode' = 'flat' then
    v_shipping := coalesce((v_ship_cfg->>'amount')::numeric, 0);
    if (v_ship_cfg->>'free_over') is not null and v_subtotal >= (v_ship_cfg->>'free_over')::numeric then
      v_shipping := 0;
    end if;
  else
    v_shipping := null; -- da quotare e comunicare al cliente
  end if;

  update orders
  set subtotal = v_subtotal, shipping_cost = v_shipping, total = v_subtotal + coalesce(v_shipping, 0)
  where id = v_order;

  insert into order_status_history (order_id, status_id, note, changed_by)
  values (v_order, v_status, 'Ordine ricevuto', v_uid);

  delete from cart_items where cart_id = v_cart;

  insert into notifications (user_id, type, title, message, link)
  values (
    v_uid, 'order_update', 'Ordine ' || v_ref || ' ricevuto',
    case when p_payment_method = 'bank_transfer'
      then 'Abbiamo ricevuto il tuo ordine. Trovi le istruzioni per il bonifico nel dettaglio ordine.'
      else 'Abbiamo ricevuto il tuo ordine. Ti aggiorneremo a ogni cambio di stato.' end,
    '/account/ordini/' || v_order
  );

  perform public.notify_admins('order_update', 'Nuovo ordine ' || v_ref,
    v_name || ' ha effettuato un nuovo ordine.', '/admin/ordini/' || v_order);

  insert into admin_reminders (order_id, user_id, title, note, due_at)
  values (v_order, v_uid, 'Conferma il nuovo ordine ' || v_ref, 'Verifica la configurazione e conferma al cliente.', now() + interval '1 day');

  return query select v_order, v_ref;
end $$;
revoke all on function public.place_order(payment_method, jsonb, jsonb, jsonb, text) from public, anon;
grant execute on function public.place_order(payment_method, jsonb, jsonb, jsonb, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Richiesta aggiornamento stato da parte del cliente
-- -----------------------------------------------------------------------------
create or replace function public.request_order_update(p_order uuid, p_message text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_o orders%rowtype;
begin
  select * into v_o from orders where id = p_order and user_id = auth.uid();
  if not found then raise exception 'order_not_found'; end if;
  if v_o.last_update_request_at is not null and v_o.last_update_request_at > now() - interval '12 hours' then
    raise exception 'update_request_too_soon';
  end if;

  update orders set last_update_request_at = now() where id = p_order;

  insert into admin_reminders (order_id, user_id, title, note, due_at)
  values (p_order, v_o.user_id, 'Richiesta aggiornamento ordine ' || v_o.reference,
          nullif(left(coalesce(p_message, ''), 2000), ''), now() + interval '1 day');

  perform public.notify_admins('update_request', 'Richiesta aggiornamento ' || v_o.reference,
    coalesce(nullif(left(p_message, 1000), ''), v_o.customer_name || ' chiede un aggiornamento sullo stato dell''ordine.'),
    '/admin/ordini/' || p_order);
end $$;
revoke all on function public.request_order_update(uuid, text) from public, anon;
grant execute on function public.request_order_update(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Funzioni amministrative
-- -----------------------------------------------------------------------------
create or replace function public.assert_admin()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;

-- Cambio stato ordine: storico + notifica cliente + reminder di contatto
create or replace function public.admin_set_order_status(
  p_order uuid, p_status uuid, p_note text default null,
  p_notify boolean default true, p_create_reminder boolean default true
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_o orders%rowtype;
  v_s order_statuses%rowtype;
begin
  perform public.assert_admin();
  select * into v_o from orders where id = p_order;
  if not found then raise exception 'order_not_found'; end if;
  select * into v_s from order_statuses where id = p_status;
  if not found then raise exception 'status_not_found'; end if;

  update orders set status_id = p_status where id = p_order;

  insert into order_status_history (order_id, status_id, note, changed_by)
  values (p_order, p_status, nullif(left(coalesce(p_note, ''), 2000), ''), auth.uid());

  if p_notify and v_o.user_id is not null then
    insert into notifications (user_id, type, title, message, link, created_by)
    values (
      v_o.user_id, 'status_change',
      'Ordine ' || v_o.reference || ': ' || v_s.label,
      coalesce(nullif(trim(p_note), ''), v_s.description, 'Lo stato del tuo ordine è stato aggiornato.'),
      '/account/ordini/' || p_order, auth.uid()
    );
  end if;

  if p_create_reminder then
    insert into admin_reminders (order_id, user_id, title, note, due_at, created_by)
    values (p_order, v_o.user_id, 'Contatta il cliente — ' || v_o.reference,
            'Stato aggiornato a "' || v_s.label || '". Contatta ' || v_o.customer_name
              || coalesce(' (' || v_o.customer_phone || ')', '') || '.',
            now() + interval '1 day', auth.uid());
  end if;
end $$;

create or replace function public.admin_set_payment_status(p_order uuid, p_status payment_status, p_notify boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_o orders%rowtype;
begin
  perform public.assert_admin();
  select * into v_o from orders where id = p_order;
  if not found then raise exception 'order_not_found'; end if;

  update orders
  set payment_status = p_status,
      payment_confirmed_at = case when p_status = 'paid' then now() else null end
  where id = p_order;

  if p_notify and v_o.user_id is not null and p_status = 'paid' then
    insert into notifications (user_id, type, title, message, link, created_by)
    values (v_o.user_id, 'order_update', 'Pagamento ricevuto — ' || v_o.reference,
            'Abbiamo registrato il pagamento del tuo ordine.', '/account/ordini/' || p_order, auth.uid());
  end if;
end $$;

-- Notifiche/comunicazioni: a utenti selezionati o a tutti i clienti attivi
create or replace function public.admin_send_notification(
  p_user_ids uuid[], p_type notification_type, p_title text, p_message text, p_link text default null
) returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  perform public.assert_admin();
  insert into notifications (user_id, type, title, message, link, created_by)
  select id, p_type, left(p_title, 160), left(p_message, 4000), nullif(p_link, ''), auth.uid()
  from profiles
  where is_active and (
    (p_user_ids is null and role = 'customer') or id = any (p_user_ids)
  );
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Ordini manuali / preventivi / test creati dall'admin con prezzi liberi
-- p_payload: { user_id?, kind, payment_method, customer:{name,email,phone}, shipping_address,
--              billing_address?, notes?, shipping_cost?, status_id?,
--              items:[{ product_id?, product_name, configuration, quantity, unit_price }] }
create or replace function public.admin_create_order(p_payload jsonb)
returns table (order_id uuid, reference text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_order    uuid;
  v_ref      text;
  v_status   uuid;
  v_item     jsonb;
  v_oi       uuid;
  v_qty      integer;
  v_unit     numeric(12,2);
  v_sub      numeric(12,2) := 0;
  v_ship     numeric(12,2) := nullif(p_payload->>'shipping_cost', '')::numeric;
  v_user     uuid := nullif(p_payload->>'user_id', '')::uuid;
  v_kind     order_kind := coalesce(nullif(p_payload->>'kind', ''), 'order')::order_kind;
  v_pm       payment_method := coalesce(nullif(p_payload->>'payment_method', ''), 'bank_transfer')::payment_method;
begin
  perform public.assert_admin();

  if jsonb_typeof(p_payload->'items') <> 'array' or jsonb_array_length(p_payload->'items') = 0 then
    raise exception 'empty_items';
  end if;
  if coalesce(trim(p_payload->'customer'->>'name'), '') = '' then
    raise exception 'customer_name_required';
  end if;

  v_status := nullif(p_payload->>'status_id', '')::uuid;
  if v_status is null then
    select id into v_status from order_statuses where is_active and is_initial order by sort_order limit 1;
  end if;
  if v_status is null then
    select id into v_status from order_statuses where is_active order by sort_order limit 1;
  end if;

  v_ref := public.next_order_reference();
  insert into orders (
    reference, user_id, kind, status_id, payment_method, payment_status,
    customer_name, customer_email, customer_phone, shipping_address, billing_address,
    customer_notes, created_by
  ) values (
    v_ref, v_user, v_kind, v_status, v_pm,
    case when v_pm = 'bank_transfer' then 'awaiting_transfer'::payment_status else 'pending'::payment_status end,
    left(p_payload->'customer'->>'name', 160),
    nullif(p_payload->'customer'->>'email', ''),
    nullif(left(p_payload->'customer'->>'phone', 40), ''),
    coalesce(p_payload->'shipping_address', '{}'::jsonb),
    p_payload->'billing_address',
    nullif(left(p_payload->>'notes', 2000), ''),
    auth.uid()
  ) returning id into v_order;

  for v_item in select * from jsonb_array_elements(p_payload->'items') loop
    v_qty := greatest(public.config_quantity(coalesce(v_item->'configuration', '{}'::jsonb), (v_item->>'quantity')::int), 1);
    v_unit := coalesce(nullif(v_item->>'unit_price', '')::numeric, 0);
    if v_unit < 0 then raise exception 'invalid_price'; end if;

    insert into order_items (order_id, product_id, product_name, product_snapshot, configuration, quantity, unit_price, line_total)
    values (
      v_order, nullif(v_item->>'product_id', '')::uuid,
      left(coalesce(nullif(v_item->>'product_name', ''), 'Prodotto personalizzato'), 160),
      jsonb_build_object('manual', true),
      coalesce(v_item->'configuration', '{}'::jsonb), v_qty, v_unit, round(v_unit * v_qty, 2)
    ) returning id into v_oi;

    perform public.materialize_order_item(v_oi, nullif(v_item->>'product_id', '')::uuid,
      coalesce(v_item->'configuration', '{}'::jsonb), v_user, false);
    v_sub := v_sub + round(v_unit * v_qty, 2);
  end loop;

  update orders set subtotal = v_sub, shipping_cost = v_ship, total = v_sub + coalesce(v_ship, 0)
  where id = v_order;

  insert into order_status_history (order_id, status_id, note, changed_by)
  values (v_order, v_status,
          case v_kind when 'quote' then 'Preventivo creato' when 'test' then 'Ordine di test' else 'Ordine creato dal backoffice' end,
          auth.uid());

  if v_user is not null and v_kind <> 'test' then
    insert into notifications (user_id, type, title, message, link, created_by)
    values (v_user, 'order_update',
            case v_kind when 'quote' then 'Nuovo preventivo ' else 'Nuovo ordine ' end || v_ref,
            case v_kind when 'quote' then 'Abbiamo preparato un preventivo per te.' else 'Abbiamo registrato un ordine a tuo nome.' end,
            '/account/ordini/' || v_order, auth.uid());
  end if;

  return query select v_order, v_ref;
end $$;

-- Duplica un prodotto con varianti, opzioni, aree, kit e scaglioni (immagini escluse)
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
    seo_title, seo_description)
  select category_id, left(name || ' (copia)', 160), v_slug, short_description, description, product_type, base_price,
    availability, is_configurable, model_shape, sizes, min_quantity, attributes, false, sort_order,
    seo_title, seo_description
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
    insert into kit_items (kit_id, component_product_id, label, model_shape, quantity, sizes, sort_order)
    values (v_new, r.component_product_id, r.label, r.model_shape, r.quantity, r.sizes, r.sort_order)
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

-- Statistiche dashboard admin
create or replace function public.admin_dashboard_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform public.assert_admin();
  select jsonb_build_object(
    'orders_total', (select count(*) from orders where kind = 'order'),
    'orders_open', (select count(*) from orders o join order_statuses s on s.id = o.status_id
                    where o.kind = 'order' and not s.is_final and not s.is_cancelled),
    'orders_last_30d', (select count(*) from orders where kind = 'order' and created_at > now() - interval '30 days'),
    'revenue_last_30d', (select coalesce(sum(o.total), 0) from orders o join order_statuses s on s.id = o.status_id
                         where o.kind = 'order' and not s.is_cancelled and o.created_at > now() - interval '30 days'),
    'awaiting_transfer', (select count(*) from orders where payment_status = 'awaiting_transfer' and kind = 'order'),
    'customers', (select count(*) from profiles where role = 'customer'),
    'contact_new', (select count(*) from contact_requests where status = 'new'),
    'reminders_open', (select count(*) from admin_reminders where not is_done),
    'products_published', (select count(*) from products where is_published and deleted_at is null),
    'orders_by_status', (
      select coalesce(jsonb_agg(jsonb_build_object('label', s.label, 'count', c.n) order by s.sort_order), '[]'::jsonb)
      from order_statuses s
      join lateral (select count(*) n from orders o where o.status_id = s.id and o.kind = 'order') c on true
      where s.is_active
    ),
    'orders_by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'count', (
        select count(*) from orders o where o.kind = 'order'
          and (o.created_at at time zone 'Europe/Rome')::date = d::date
      )) order by d), '[]'::jsonb)
      from generate_series((now() at time zone 'Europe/Rome')::date - 29, (now() at time zone 'Europe/Rome')::date, interval '1 day') d
    )
  ) into v;
  return v;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'admin_set_order_status(uuid, uuid, text, boolean, boolean)',
    'admin_set_payment_status(uuid, payment_status, boolean)',
    'admin_send_notification(uuid[], notification_type, text, text, text)',
    'admin_create_order(jsonb)',
    'admin_duplicate_product(uuid)',
    'admin_dashboard_stats()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Audit log
-- -----------------------------------------------------------------------------
create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row     jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_id      text := coalesce(v_row->>'id', v_row->>'key', v_row->>'product_id');
  v_details jsonb := '{}'::jsonb;
  v_changed jsonb;
begin
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_agg(n.key), '[]'::jsonb) into v_changed
    from jsonb_each(to_jsonb(new)) n
    where n.key not in ('updated_at', 'updated_by') and (to_jsonb(old) -> n.key) is distinct from n.value;
    if v_changed = '[]'::jsonb then return new; end if;
    v_details := jsonb_build_object('changed', v_changed);
  elsif tg_op = 'INSERT' then
    v_details := jsonb_build_object('label', coalesce(v_row->>'name', v_row->>'title', v_row->>'reference', v_row->>'label', v_row->>'question'));
  else
    v_details := jsonb_build_object('label', coalesce(v_row->>'name', v_row->>'title', v_row->>'reference', v_row->>'label', v_row->>'question'));
  end if;

  insert into audit_logs (actor_id, action, entity, entity_id, details)
  values (auth.uid(), lower(tg_op), tg_table_name, v_id, v_details);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'products','categories','garment_types','orders','order_statuses','settings',
    'pages','site_content','faqs','profiles','featured_products','customization_assets'
  ] loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_trigger()', t, t);
  end loop;
end $$;
