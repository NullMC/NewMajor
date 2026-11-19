-- Registrazione con nome utente: l'email è facoltativa in registrazione e diventa
-- obbligatoria (insieme al telefono) solo al momento dell'ordine.
--
-- Supabase Auth richiede un'email per l'accesso con password: chi si registra senza email
-- riceve un indirizzo tecnico <nomeutente>@utenti.newmajor.invalid (dominio riservato .invalid,
-- nessuna email può esservi recapitata). Nel profilo il campo email resta vuoto finché il cliente
-- non indica un recapito reale. Richiede "Confirm email" disattivato in Supabase Auth.

create or replace function public.username_email_domain()
returns text language sql immutable as $$ select 'utenti.newmajor.invalid' $$;

create or replace function public.is_username_email(p_email text)
returns boolean language sql immutable as $$
  select coalesce(lower(p_email) like '%@' || public.username_email_domain(), false)
$$;

alter table public.profiles add column username text;
alter table public.profiles add constraint profiles_username_format
  check (username ~ '^[a-z0-9][a-z0-9._-]{2,29}$');
create unique index profiles_username_key on public.profiles(username);

-- Profilo creato alla registrazione: nome utente dai metadati, email solo se reale
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_username text := nullif(lower(trim(coalesce(new.raw_user_meta_data->>'username', ''))), '');
begin
  if v_username is null and public.is_username_email(new.email) then
    v_username := split_part(lower(new.email), '@', 1);
  end if;
  insert into public.profiles (id, email, username, full_name, phone)
  values (
    new.id,
    case when public.is_username_email(new.email) then null else lower(new.email) end,
    v_username,
    nullif(left(coalesce(new.raw_user_meta_data->>'full_name', ''), 120), ''),
    nullif(left(coalesce(new.raw_user_meta_data->>'phone', ''), 40), '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email and not public.is_username_email(new.email) then
    update public.profiles set email = lower(new.email) where id = new.id;
  end if;
  return new;
end $$;

-- L'email del profilo è ora il recapito del cliente e può essere aggiornata da lui.
-- Ruolo e stato restano riservati agli admin; il nome utente (credenziale di accesso) non si cambia dall'app.
create or replace function public.protect_profile_fields()
returns trigger language plpgsql as $$
begin
  if auth.role() = 'authenticated' then
    if new.username is distinct from old.username then
      raise exception 'forbidden_profile_change' using errcode = '42501';
    end if;
    if not public.is_admin() and (new.role is distinct from old.role or new.is_active is distinct from old.is_active) then
      raise exception 'forbidden_profile_change' using errcode = '42501';
    end if;
  end if;
  if new.email is not null and new.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'email_required';
  end if;
  -- Un admin non può rimuovere il proprio ruolo (evita backoffice senza amministratori)
  if auth.uid() = old.id and old.role = 'admin' and (new.role <> 'admin' or not new.is_active) then
    raise exception 'cannot_demote_self' using errcode = '42501';
  end if;
  return new;
end $$;

-- Verifica disponibilità del nome utente nel modulo di registrazione
create or replace function public.username_available(p_username text)
returns boolean language sql stable security definer set search_path = public as $$
  select lower(trim(p_username)) ~ '^[a-z0-9][a-z0-9._-]{2,29}$'
     and not exists (select 1 from public.profiles where username = lower(trim(p_username)))
     and not exists (select 1 from auth.users where lower(email) = lower(trim(p_username)) || '@' || public.username_email_domain())
$$;
revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

-- Checkout: email e telefono obbligatori
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
  v_email     text;
  v_phone     text;
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
  -- Email e telefono sono obbligatori per ordinare (la registrazione non li richiede).
  v_email := lower(coalesce(nullif(trim(p_customer->>'email'), ''), v_profile.email));
  v_phone := left(coalesce(nullif(trim(p_customer->>'phone'), ''), v_profile.phone), 40);
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or public.is_username_email(v_email) then
    raise exception 'email_required';
  end if;
  if v_phone is null or length(regexp_replace(v_phone, '\D', '', 'g')) < 6 then
    raise exception 'phone_required';
  end if;
  -- I recapiti indicati al primo ordine vengono salvati nel profilo
  update profiles set email = coalesce(email, v_email), phone = coalesce(phone, v_phone) where id = v_uid;

  v_ref := public.next_order_reference();

  insert into orders (
    reference, user_id, kind, status_id, payment_method, payment_status,
    customer_name, customer_email, customer_phone,
    shipping_address, billing_address, customer_notes, created_by
  ) values (
    v_ref, v_uid, 'order', v_status, p_payment_method,
    case when p_payment_method = 'bank_transfer' then 'awaiting_transfer'::payment_status else 'pending'::payment_status end,
    left(v_name, 160),
    left(v_email, 254),
    v_phone,
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
