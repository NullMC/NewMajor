-- =============================================================================
-- New Major — Dati DIMOSTRATIVI (facoltativi, NON applicati dalle migration)
-- =============================================================================
-- Crea un prodotto di prova NON PUBBLICATO per verificare il configuratore dal
-- backoffice. Nessun prezzo: tutti gli importi sono 0 e vanno impostati dall'admin.
-- Eliminalo (Backoffice → Prodotti → Archivia → Elimina definitivamente) quando
-- non serve più.
-- =============================================================================

do $$
declare
  v_product uuid;
  v_option  uuid;
begin
  if exists (select 1 from public.products where slug = 'prodotto-dimostrativo') then
    raise notice 'Prodotto dimostrativo già presente';
    return;
  end if;

  insert into public.products (name, slug, short_description, product_type, base_price, model_shape, sizes, is_published, is_configurable)
  values ('Prodotto dimostrativo', 'prodotto-dimostrativo', 'Prodotto di prova per verificare il configuratore. Non pubblicato.',
          'simple', 0, 'tshirt', array['S','M','L','XL'], false, true)
  returning id into v_product;

  insert into public.product_garment_types (product_id, garment_type_id, sort_order)
  select v_product, id, sort_order from public.garment_types;

  insert into public.product_variants (product_id, name, color_hex, secondary_hex, sort_order) values
    (v_product, 'Bianco / nero', '#F4F4F2', '#0E0E10', 10),
    (v_product, 'Nero / oro', '#0E0E10', '#C2A063', 20);

  insert into public.product_options (product_id, name, is_required) values (v_product, 'Collo', true) returning id into v_option;
  insert into public.product_option_values (option_id, label, sort_order) values (v_option, 'Girocollo', 10), (v_option, 'A V', 20);

  insert into public.customization_areas (product_id, name, side, area_type, x, y, width, height, print_width_cm, print_height_cm, max_chars, sort_order) values
    (v_product, 'Logo cuore', 'front', 'logo', 56, 25, 13, 12, 8, 8, null, 10),
    (v_product, 'Sponsor petto', 'front', 'sponsor', 30, 40, 40, 13, 25, 8, null, 20),
    (v_product, 'Grafica all-over', 'front', 'all_over', 0, 0, 100, 100, 70, 75, null, 30),
    (v_product, 'Nome retro', 'back', 'text', 27, 17, 46, 8, 28, 6, 14, 40),
    (v_product, 'Numero retro', 'back', 'number', 32, 27, 36, 30, 25, 25, 2, 50);
end $$;
