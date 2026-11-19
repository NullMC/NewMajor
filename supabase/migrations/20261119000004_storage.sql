-- =============================================================================
-- New Major — Storage
-- =============================================================================
-- public-media     : immagini prodotto, categorie, libreria grafiche, media del sito (lettura pubblica, scrittura admin)
-- customer-uploads : loghi/sponsor/grafiche caricati dai clienti e anteprime 3D (privato)
--                    struttura: {user_id}/{uuid}.{ext} — accesso solo al proprietario e agli admin
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('public-media', 'public-media', true, 26214400,
    array['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/svg+xml']),
  ('customer-uploads', 'customer-uploads', false, 52428800,
    array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- public-media -----------------------------------------------------------------
create policy "public_media_read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'public-media');
create policy "public_media_admin_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'public-media' and public.is_admin());
create policy "public_media_admin_update" on storage.objects
  for update to authenticated using (bucket_id = 'public-media' and public.is_admin())
  with check (bucket_id = 'public-media' and public.is_admin());
create policy "public_media_admin_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'public-media' and public.is_admin());

-- customer-uploads -------------------------------------------------------------
create policy "uploads_insert_own" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'customer-uploads'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
create policy "uploads_select_own" on storage.objects
  for select to authenticated using (
    bucket_id = 'customer-uploads'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
-- I clienti non possono eliminare i file (servono alla produzione degli ordini); solo gli admin.
create policy "uploads_admin_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'customer-uploads' and public.is_admin());
