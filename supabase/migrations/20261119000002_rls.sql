-- =============================================================================
-- New Major — Ruoli, profili e Row Level Security
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper ruoli
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Creazione automatica profilo alla registrazione
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    new.email,
    nullif(left(coalesce(new.raw_user_meta_data->>'full_name', ''), 120), ''),
    nullif(left(coalesce(new.raw_user_meta_data->>'phone', ''), 40), '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Allinea l'email del profilo quando cambia in auth.users
create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- Impedisce a utenti non admin di modificare ruolo, stato o email del profilo.
-- (Dalla SQL console di Supabase auth.role() è null: consente il bootstrap del primo admin.)
create or replace function public.protect_profile_fields()
returns trigger language plpgsql as $$
begin
  if auth.role() = 'authenticated' and not public.is_admin() then
    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.email is distinct from old.email then
      raise exception 'forbidden_profile_change' using errcode = '42501';
    end if;
  end if;
  -- Un admin non può rimuovere il proprio ruolo (evita backoffice senza amministratori)
  if auth.uid() = old.id and old.role = 'admin' and (new.role <> 'admin' or not new.is_active) then
    raise exception 'cannot_demote_self' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- -----------------------------------------------------------------------------
-- Abilita RLS su tutte le tabelle
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','addresses','categories','garment_types','products','product_garment_types',
    'product_variants','product_options','product_option_values','product_images','kit_items',
    'customization_areas','customization_assets','price_tiers','related_products','featured_products',
    'carts','cart_items','order_statuses','orders','order_items','order_item_customizations',
    'order_item_roster','order_status_history','order_internal_notes','notifications',
    'contact_requests','pages','site_content','faqs','settings','media','admin_reminders','audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    -- Gli admin hanno pieno accesso a ogni tabella
    execute format(
      'create policy "admin_all_%s" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      t, t
    );
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Profili e indirizzi
-- -----------------------------------------------------------------------------
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "addresses_own" on public.addresses
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Catalogo: lettura pubblica dei soli contenuti pubblicati
-- -----------------------------------------------------------------------------
create or replace function public.product_is_visible(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.products
    where id = p_id and is_published and deleted_at is null
  );
$$;
grant execute on function public.product_is_visible(uuid) to anon, authenticated;

create policy "categories_public" on public.categories
  for select to anon, authenticated using (is_active and deleted_at is null);
create policy "garment_types_public" on public.garment_types
  for select to anon, authenticated using (is_active);
create policy "products_public" on public.products
  for select to anon, authenticated using (is_published and deleted_at is null);
create policy "pgt_public" on public.product_garment_types
  for select to anon, authenticated using (public.product_is_visible(product_id));
create policy "variants_public" on public.product_variants
  for select to anon, authenticated using (is_active and public.product_is_visible(product_id));
create policy "options_public" on public.product_options
  for select to anon, authenticated using (public.product_is_visible(product_id));
create policy "option_values_public" on public.product_option_values
  for select to anon, authenticated using (
    is_active and exists (
      select 1 from public.product_options o
      where o.id = option_id and public.product_is_visible(o.product_id)
    )
  );
create policy "images_public" on public.product_images
  for select to anon, authenticated using (public.product_is_visible(product_id));
create policy "kit_items_public" on public.kit_items
  for select to anon, authenticated using (public.product_is_visible(kit_id));
create policy "areas_public" on public.customization_areas
  for select to anon, authenticated using (is_active and public.product_is_visible(product_id));
create policy "assets_public" on public.customization_assets
  for select to anon, authenticated using (is_active);
create policy "tiers_public" on public.price_tiers
  for select to anon, authenticated using (public.product_is_visible(product_id));
create policy "related_public" on public.related_products
  for select to anon, authenticated using (
    public.product_is_visible(product_id) and public.product_is_visible(related_id)
  );
create policy "featured_public" on public.featured_products
  for select to anon, authenticated using (public.product_is_visible(product_id));

-- -----------------------------------------------------------------------------
-- Carrello: ogni utente vede e modifica solo il proprio
-- -----------------------------------------------------------------------------
create policy "carts_own" on public.carts
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "cart_items_own" on public.cart_items
  for all to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- Ordini: il cliente legge solo i propri; scritture solo tramite RPC
-- -----------------------------------------------------------------------------
create policy "order_statuses_public" on public.order_statuses
  for select to anon, authenticated using (is_active);

create policy "orders_select_own" on public.orders
  for select to authenticated using (user_id = auth.uid());

create policy "order_items_select_own" on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
  );
create policy "oic_select_own" on public.order_item_customizations
  for select to authenticated using (
    exists (
      select 1 from public.order_items i join public.orders o on o.id = i.order_id
      where i.id = order_item_id and o.user_id = auth.uid()
    )
  );
create policy "oir_select_own" on public.order_item_roster
  for select to authenticated using (
    exists (
      select 1 from public.order_items i join public.orders o on o.id = i.order_id
      where i.id = order_item_id and o.user_id = auth.uid()
    )
  );
create policy "osh_select_own" on public.order_status_history
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
  );

-- -----------------------------------------------------------------------------
-- Notifiche: lettura propria, aggiornamento limitato allo stato "letto"
-- -----------------------------------------------------------------------------
create policy "notifications_select_own" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "notifications_update_own" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications_delete_own" on public.notifications
  for delete to authenticated using (user_id = auth.uid());

-- Il cliente può modificare solo is_read/read_at
create or replace function public.protect_notification_fields()
returns trigger language plpgsql as $$
begin
  if auth.role() = 'authenticated' and not public.is_admin() then
    if new.user_id is distinct from old.user_id or new.title is distinct from old.title
       or new.message is distinct from old.message or new.type is distinct from old.type
       or new.link is distinct from old.link or new.created_by is distinct from old.created_by then
      raise exception 'forbidden_notification_change' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger notifications_protect before update on public.notifications
  for each row execute function public.protect_notification_fields();

-- -----------------------------------------------------------------------------
-- Contatti: chiunque può inviare una richiesta; solo admin legge
-- -----------------------------------------------------------------------------
create policy "contact_insert_public" on public.contact_requests
  for insert to anon, authenticated with check (
    status = 'new' and admin_notes is null
    and (user_id is null or user_id = auth.uid())
  );

-- -----------------------------------------------------------------------------
-- Contenuti pubblici
-- -----------------------------------------------------------------------------
create policy "pages_public" on public.pages
  for select to anon, authenticated using (is_published and deleted_at is null);
create policy "site_content_public" on public.site_content
  for select to anon, authenticated using (true);
create policy "faqs_public" on public.faqs
  for select to anon, authenticated using (is_active);
create policy "settings_public" on public.settings
  for select to anon, authenticated using (is_public);

-- media, admin_reminders, audit_logs, order_internal_notes: solo admin (policy admin_all_*)
