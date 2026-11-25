// Test del database: applica le migration su PGlite (Postgres in WASM) con stub degli
// schemi Supabase (auth, storage) e verifica RLS, prezzi lato server e funzioni RPC.
// Uso: npm run test:db
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = process.argv[2] ?? fileURLToPath(new URL('../migrations', import.meta.url))
const db = new PGlite()
let failures = 0
const ok = (m) => console.log('  ✓', m)
const fail = (m) => { failures++; console.log('  ✗', m) }

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  -- Come i progetti Supabase recenti: nessun privilegio automatico sulle tabelle di public
  -- (li concede la migration *_api_grants.sql).
  grant usage on schema public to anon, authenticated;
  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true),'') $$;
  grant execute on function auth.uid() to anon, authenticated; grant execute on function auth.role() to anon, authenticated;
  create schema storage;
  grant usage on schema storage to anon, authenticated;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
`)

for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  try {
    await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'))
    ok(`migration ${f}`)
  } catch (e) {
    fail(`migration ${f}: ${e.message}`)
    process.exit(1)
  }
}

// Helper: esegue come utente autenticato (o anon) con RLS attiva
async function as(uid, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); select set_config('request.jwt.claim.role', '${uid ? 'authenticated' : 'anon'}', false);`)
  await db.exec(`set role ${uid ? 'authenticated' : 'anon'}`)
  try { return await fn() } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); select set_config('request.jwt.claim.role', '', false);`) }
}
const q = async (sql, params) => (await db.query(sql, params)).rows
async function expectError(label, fn, match) {
  try { await fn(); fail(`${label}: nessun errore`) } catch (e) { (!match || e.message.includes(match)) ? ok(`${label} → ${e.message}`) : fail(`${label}: errore inatteso ${e.message}`) }
}

console.log('\nUtenti e ruoli')
const [admin] = await q(`insert into auth.users (email, raw_user_meta_data) values ('admin@test.it', '{"full_name":"Admin"}') returning id`)
const [c1] = await q(`insert into auth.users (email, raw_user_meta_data) values ('c1@test.it', '{"full_name":"Mario Rossi","phone":"3331234567"}') returning id`)
const [c2] = await q(`insert into auth.users (email) values ('c2@test.it') returning id`)
const profiles = await q(`select count(*)::int n from profiles`)
profiles[0].n === 3 ? ok('profili creati dal trigger') : fail('profili non creati')
await q(`update profiles set role = 'admin' where email = 'admin@test.it'`)
ok('bootstrap primo admin da SQL console')
await expectError('cliente non può diventare admin', () => as(c1.id, () => q(`update profiles set role='admin' where id=$1`, [c1.id])), 'forbidden_profile_change')
await as(c1.id, () => q(`update profiles set phone='3341234567' where id=$1`, [c1.id]))
ok('cliente aggiorna i propri dati')
const otherProfiles = await as(c1.id, () => q(`select id from profiles`))
otherProfiles.length === 1 ? ok('cliente vede solo il proprio profilo') : fail(`cliente vede ${otherProfiles.length} profili`)
await expectError('admin non può togliersi il ruolo', () => as(admin.id, () => q(`update profiles set role='customer' where id=$1`, [admin.id])), 'cannot_demote_self')

console.log('\nCatalogo (admin)')
const { cat, prod, variant, optVal, areaLogo, areaNum, gt } = await as(admin.id, async () => {
  const [cat] = await q(`insert into categories (name, slug) values ('Calcio', 'calcio') returning id`)
  const [prod] = await q(`insert into products (name, slug, category_id, base_price, is_published, sizes, min_quantity) values ('Maglia test', 'maglia-test', $1, 20, true, '{S,M,L}', 2) returning id`, [cat.id])
  const [variant] = await q(`insert into product_variants (product_id, name, color_hex, price_delta) values ($1, 'Nero', '#000000', 1.5) returning id`, [prod.id])
  const [opt] = await q(`insert into product_options (product_id, name, is_required) values ($1, 'Collo', true) returning id`, [prod.id])
  const [optVal] = await q(`insert into product_option_values (option_id, label, price_delta) values ($1, 'A V', 3) returning id`, [opt.id])
  const [areaLogo] = await q(`insert into customization_areas (product_id, name, area_type, price_delta) values ($1, 'Logo cuore', 'logo', 2) returning id`, [prod.id])
  const [areaNum] = await q(`insert into customization_areas (product_id, name, area_type, side, price_delta) values ($1, 'Numero retro', 'number', 'back', 1) returning id`, [prod.id])
  await q(`insert into price_tiers (product_id, min_quantity, discount_percent) values ($1, 3, 10)`, [prod.id])
  const [gt] = await q(`select id from garment_types where slug='mizuno'`)
  await q(`insert into product_garment_types (product_id, garment_type_id, price_delta) values ($1, $2, 4)`, [prod.id, gt.id])
  await q(`insert into featured_products (product_id) values ($1)`, [prod.id])
  return { cat, prod, variant, optVal, areaLogo, areaNum, gt }
})
ok('prodotto completo creato')
const anonProducts = await as(null, () => q(`select id from products`))
anonProducts.length === 1 ? ok('anonimo vede il prodotto pubblicato') : fail('anonimo non vede prodotti')
await expectError('anonimo non può creare prodotti', () => as(null, () => q(`insert into products (name, slug) values ('x','x')`)))
await expectError('cliente non può modificare prodotti', async () => {
  const r = await as(c1.id, () => q(`update products set base_price = 0 where id=$1 returning id`, [prod.id]))
  if (!r.length) throw new Error('0 righe aggiornate (RLS)')
})

console.log('\nCarrello e checkout (cliente)')
const config = {
  version: 1, garmentTypeId: gt.id, variantId: variant.id, optionValueIds: [optVal.id],
  areas: {
    [areaLogo.id]: { enabled: true, asset: { bucket: 'customer-uploads', path: `${c1.id}/graphics/a.png`, name: 'a.png', width: 2000, height: 2000, quality: 'ok' } },
    [areaNum.id]: { enabled: true },
  },
  roster: [{ id: '1', name: 'ROSSI', number: '10', size: 'M', quantity: 2 }, { id: '2', name: 'BIANCHI', number: '7', size: 'L', quantity: 1 }],
  preview: { front: `${c1.id}/previews/f.png` },
}
// unitario: 20 + 4 (mizuno) + 1.5 (variante) + 3 (opzione) + 2 (logo) + 1 (numero) = 31.5 ; qty 3 → sconto 10% → 85.05
const order = await as(c1.id, async () => {
  const [cart] = await q(`insert into carts (user_id) values ($1) returning id`, [c1.id])
  await q(`insert into cart_items (cart_id, product_id, configuration, quantity) values ($1, $2, $3, 1)`, [cart.id, prod.id, JSON.stringify(config)])
  const [o] = await q(`select * from place_order('bank_transfer', $1, null, '{"name":"Mario Rossi"}', 'nota')`, [JSON.stringify({ full_name: 'Mario Rossi', line1: 'Via Roma 1', city: 'Bari', postal_code: '70100', country: 'IT' })])
  return o
})
order?.reference?.startsWith('NM') ? ok(`ordine creato ${order.reference}`) : fail('ordine non creato')
const [ord] = await q(`select subtotal, total, payment_status, shipping_cost from orders where id=$1`, [order.order_id])
Number(ord.subtotal) === 85.05 ? ok(`prezzo ricalcolato dal DB: ${ord.subtotal}`) : fail(`subtotale atteso 85.05, ottenuto ${ord.subtotal}`)
ord.payment_status === 'awaiting_transfer' ? ok('stato pagamento: in attesa di bonifico') : fail(ord.payment_status)
ord.shipping_cost === null ? ok('spedizione da quotare (impostazione predefinita)') : fail('spedizione inattesa')
const [{ n: rosterN }] = await q(`select count(*)::int n from order_item_roster`)
rosterN === 2 ? ok('roster materializzato') : fail(`roster ${rosterN}`)
const [{ n: custN }] = await q(`select count(*)::int n from order_item_customizations`)
custN === 2 ? ok('personalizzazioni materializzate') : fail(`personalizzazioni ${custN}`)
const [{ n: cartN }] = await q(`select count(*)::int n from cart_items`)
cartN === 0 ? ok('carrello svuotato') : fail('carrello non svuotato')
const notifs = await as(c1.id, () => q(`select title from notifications`))
notifs.length === 1 ? ok(`notifica cliente: ${notifs[0].title}`) : fail('notifica cliente mancante')
const adminNotifs = await as(admin.id, () => q(`select title from notifications where user_id=$1`, [admin.id]))
adminNotifs.length === 1 ? ok('notifica admin nuovo ordine') : fail('notifica admin mancante')

await expectError('quantità minima rispettata', () => as(c1.id, async () => {
  const [cart] = await q(`select id from carts where user_id=$1`, [c1.id])
  await q(`insert into cart_items (cart_id, product_id, configuration, quantity) values ($1, $2, $3, 1)`, [cart.id, prod.id, JSON.stringify({ ...config, roster: [{ id: 'x', size: 'M', quantity: 1 }] })])
  await q(`select * from place_order('cash_on_delivery', $1)`, [JSON.stringify({ full_name: 'M', line1: 'V', city: 'B', postal_code: '70100' })])
}), 'min_quantity')
await expectError('percorso grafica di un altro utente rifiutato', () => as(c1.id, async () => {
  await q(`delete from cart_items`)
  const [cart] = await q(`select id from carts where user_id=$1`, [c1.id])
  const bad = { ...config, areas: { [areaLogo.id]: { enabled: true, asset: { bucket: 'customer-uploads', path: `${c2.id}/x.png` } } } }
  await q(`insert into cart_items (cart_id, product_id, configuration, quantity) values ($1, $2, $3, 1)`, [cart.id, prod.id, JSON.stringify(bad)])
  await q(`select * from place_order('cash_on_delivery', $1)`, [JSON.stringify({ full_name: 'M', line1: 'V', city: 'B', postal_code: '70100' })])
}), 'invalid_asset_path')
await as(c1.id, () => q(`delete from cart_items`))
await expectError('taglia non valida rifiutata', () => as(c1.id, async () => {
  const [cart] = await q(`select id from carts where user_id=$1`, [c1.id])
  await q(`insert into cart_items (cart_id, product_id, configuration, quantity) values ($1, $2, $3, 1)`, [cart.id, prod.id, JSON.stringify({ ...config, roster: [{ id: 'x', size: 'XXXL', quantity: 5 }] })])
  await q(`select * from place_order('cash_on_delivery', $1)`, [JSON.stringify({ full_name: 'M', line1: 'V', city: 'B', postal_code: '70100' })])
}), 'invalid_size')
await as(c1.id, () => q(`delete from cart_items`))

console.log('\nIsolamento dati (RLS)')
const c2orders = await as(c2.id, () => q(`select id from orders`))
c2orders.length === 0 ? ok('un altro cliente non vede l’ordine') : fail('LEAK ordini')
const c2items = await as(c2.id, () => q(`select id from order_items`))
c2items.length === 0 ? ok('un altro cliente non vede le righe ordine') : fail('LEAK righe')
await expectError('cliente non può inserire ordini direttamente', () => as(c1.id, () => q(`insert into orders (reference, status_id, payment_method, customer_name, shipping_address) select 'X', id, 'cash_on_delivery', 'x', '{}' from order_statuses limit 1`)))
const rem = await as(c1.id, () => q(`select id from admin_reminders`))
rem.length === 0 ? ok('cliente non vede i promemoria admin') : fail('LEAK reminders')
const notes = await as(c1.id, () => q(`select id from order_internal_notes`))
notes.length === 0 ? ok('cliente non vede note interne') : fail('LEAK note')
await expectError('cliente non può cambiare stato ordine', () => as(c1.id, () => q(`select admin_set_order_status($1, (select id from order_statuses where code='confirmed'))`, [order.order_id])), 'forbidden')
await expectError('cliente non può modificare il testo di una notifica', () => as(c1.id, () => q(`update notifications set title='hack'`)), 'forbidden_notification_change')
await as(c1.id, () => q(`update notifications set is_read = true`))
ok('cliente segna notifiche come lette')

console.log('\nContatti')
await as(null, () => q(`insert into contact_requests (name, email, message) values ('Ospite', 'o@test.it', 'Vorrei un preventivo')`))
ok('anonimo invia richiesta di contatto')
const anonContacts = await as(null, () => q(`select id from contact_requests`))
anonContacts.length === 0 ? ok('anonimo non legge le richieste') : fail('LEAK contatti')
await expectError('richiesta con email non valida rifiutata', () => as(null, () => q(`insert into contact_requests (name, email, message) values ('x', 'nonvalida', 'messaggio')`)))

console.log('\nBackoffice')
await as(admin.id, () => q(`select admin_set_order_status($1, (select id from order_statuses where code='production'), 'In stampa', true, true)`, [order.order_id]))
const [{ label }] = await q(`select s.label from orders o join order_statuses s on s.id=o.status_id where o.id=$1`, [order.order_id])
label === 'In produzione' ? ok('stato aggiornato') : fail(label)
const remAfter = await q(`select title from admin_reminders where order_id=$1`, [order.order_id])
remAfter.length === 2 ? ok('promemoria "contatta il cliente" generato') : fail(`promemoria ${remAfter.length}`)
const n2 = await as(c1.id, () => q(`select title from notifications order by created_at`))
n2.length === 2 ? ok(`notifica cambio stato: ${n2[1].title}`) : fail('notifica stato mancante')
await as(c1.id, () => q(`select request_order_update($1, 'novità?')`, [order.order_id]))
ok('cliente richiede aggiornamento')
await expectError('seconda richiesta troppo ravvicinata', () => as(c1.id, () => q(`select request_order_update($1, 'ancora?')`, [order.order_id])), 'update_request_too_soon')
await as(admin.id, () => q(`select admin_set_payment_status($1, 'paid')`, [order.order_id]))
const [{ payment_status }] = await q(`select payment_status from orders where id=$1`, [order.order_id])
payment_status === 'paid' ? ok('pagamento confermato manualmente') : fail(payment_status)
const [manual] = await as(admin.id, () => q(`select * from admin_create_order($1)`, [JSON.stringify({
  kind: 'quote', customer: { name: 'ASD Bisceglie' }, shipping_address: { full_name: 'ASD', line1: 'x', city: 'Bisceglie', postal_code: '76011' }, shipping_cost: 10,
  items: [{ product_name: 'Kit su misura', unit_price: 25, quantity: 4, configuration: { customAreas: [{ name: 'Logo', type: 'logo', side: 'front' }], roster: [] } }],
})]))
const [mo] = await q(`select total, kind from orders where id=$1`, [manual.order_id])
Number(mo.total) === 110 && mo.kind === 'quote' ? ok(`preventivo manuale ${manual.reference} totale ${mo.total}`) : fail(JSON.stringify(mo))
const [dup] = await as(admin.id, () => q(`select admin_duplicate_product($1) id`, [prod.id]))
const [dupCounts] = await q(`select (select count(*) from product_variants where product_id=$1)::int v, (select count(*) from customization_areas where product_id=$1)::int a, (select count(*) from product_option_values v join product_options o on o.id=v.option_id where o.product_id=$1)::int ov, (select is_published from products where id=$1) pub`, [dup.id])
dupCounts.v === 1 && dupCounts.a === 2 && dupCounts.ov === 1 && dupCounts.pub === false ? ok('prodotto duplicato in bozza con varianti, opzioni e aree') : fail(JSON.stringify(dupCounts))
const [stats] = await as(admin.id, () => q(`select admin_dashboard_stats() s`))
stats.s.orders_total === 1 && stats.s.orders_by_day.length === 30 ? ok('statistiche dashboard') : fail(JSON.stringify(stats.s).slice(0, 200))
const [{ n: sent }] = await as(admin.id, () => q(`select admin_send_notification(null, 'discount', 'Saldi', 'Sconto del 10%') n`))
sent === 2 ? ok('comunicazione inviata a tutti i clienti attivi (2)') : fail(`inviate ${sent}`)
await expectError('cliente non può inviare comunicazioni', () => as(c1.id, () => q(`select admin_send_notification(null, 'discount', 'x', 'y')`)), 'forbidden')
const [{ n: audit }] = await q(`select count(*)::int n from audit_logs`)
audit > 0 ? ok(`registro attività: ${audit} eventi`) : fail('audit vuoto')

console.log('\nRegistrazione con nome utente (email facoltativa)')
const [u] = await q(`insert into auth.users (email, raw_user_meta_data) values ('squadra.rossi@utenti.newmajor.invalid', '{"username":"squadra.rossi","full_name":"Luca Verdi"}') returning id`)
const [up] = await q(`select username, email, phone from profiles where id=$1`, [u.id])
up.username === 'squadra.rossi' && up.email === null ? ok('profilo con nome utente e senza email (indirizzo tecnico non esposto)') : fail(JSON.stringify(up))
const [{ a: taken }] = await as(null, () => q(`select username_available('Squadra.Rossi') a`))
const [{ a: free }] = await as(null, () => q(`select username_available('nuovo_utente') a`))
const [{ a: bad }] = await as(null, () => q(`select username_available('ab') a`))
!taken && free && !bad ? ok('username_available: occupato, libero, formato non valido') : fail(`${taken} ${free} ${bad}`)
await expectError('nome utente duplicato rifiutato', () => q(`insert into auth.users (email, raw_user_meta_data) values ('altro@test.it', '{"username":"squadra.rossi"}')`), 'duplicate key')
await expectError('cliente non può cambiare nome utente', () => as(u.id, () => q(`update profiles set username='altro' where id=$1`, [u.id])), 'forbidden_profile_change')
const simpleConfig = { ...config, areas: {}, preview: {}, roster: [{ id: '1', name: 'VERDI', number: '9', size: 'M', quantity: 2 }] }
await as(u.id, async () => {
  const [cart] = await q(`insert into carts (user_id) values ($1) returning id`, [u.id])
  await q(`insert into cart_items (cart_id, product_id, configuration, quantity) values ($1, $2, $3, 1)`, [cart.id, prod.id, JSON.stringify(simpleConfig)])
})
const shipU = JSON.stringify({ full_name: 'Luca Verdi', line1: 'Via Roma 2', city: 'Bari', postal_code: '70100', country: 'IT' })
await expectError('ordine senza email rifiutato', () => as(u.id, () => q(`select * from place_order('cash_on_delivery', $1, null, '{"phone":"3401234567"}')`, [shipU])), 'email_required')
await expectError('ordine con indirizzo tecnico rifiutato', () => as(u.id, () => q(`select * from place_order('cash_on_delivery', $1, null, '{"email":"squadra.rossi@utenti.newmajor.invalid","phone":"3401234567"}')`, [shipU])), 'email_required')
await expectError('ordine senza telefono rifiutato', () => as(u.id, () => q(`select * from place_order('cash_on_delivery', $1, null, '{"email":"luca@test.it"}')`, [shipU])), 'phone_required')
const [uo] = await as(u.id, () => q(`select * from place_order('cash_on_delivery', $1, null, '{"email":"Luca@Test.it","phone":"340 123 4567"}')`, [shipU]))
const [uord] = await q(`select customer_email, customer_phone from orders where id=$1`, [uo.order_id])
uord.customer_email === 'luca@test.it' && uord.customer_phone === '340 123 4567' ? ok(`ordine con email e telefono indicati al checkout (${uo.reference})`) : fail(JSON.stringify(uord))
const [up2] = await q(`select email, phone from profiles where id=$1`, [u.id])
up2.email === 'luca@test.it' && up2.phone === '340 123 4567' ? ok('recapiti salvati nel profilo al primo ordine') : fail(JSON.stringify(up2))
await as(u.id, () => q(`update profiles set email='nuova@test.it' where id=$1`, [u.id]))
ok('cliente aggiorna la propria email di contatto')
await expectError('email non valida nel profilo rifiutata', () => as(u.id, () => q(`update profiles set email='non-valida' where id=$1`, [u.id])), 'email_required')

console.log('\nContenuti pubblici')
const pages = await as(null, () => q(`select slug from pages where kind='legal' order by sort_order`))
pages.length === 4 ? ok(`pagine legali: ${pages.map((p) => p.slug).join(', ')}`) : fail('pagine legali')
const pub = await as(null, () => q(`select key from settings order by key`))
pub.length === 7 ? ok('impostazioni pubbliche leggibili') : fail(`settings ${pub.length}`)
await expectError('anonimo non modifica impostazioni', async () => {
  const r = await as(null, () => q(`update settings set value='{}' where key='company' returning key`))
  if (!r.length) throw new Error('0 righe (RLS)')
})
const [home] = await as(null, () => q(`select value from site_content where key='home.sections'`))
!('quality' in home.value) && home.value.portfolio?.title === 'Progetti realizzati' ? ok('home: sezione portfolio al posto di quella qualità') : fail(JSON.stringify(Object.keys(home.value)))
await as(admin.id, () => q(`insert into portfolio_posts (team_name, image_path, is_published) values ('Squadra A', 'portfolio/a.webp', true), ('Squadra B', 'portfolio/b.webp', false)`))
ok('admin pubblica post del portfolio')
const anonPosts = await as(null, () => q(`select team_name from portfolio_posts`))
anonPosts.length === 1 && anonPosts[0].team_name === 'Squadra A' ? ok('anonimo vede solo i post pubblicati') : fail(`portfolio anonimo: ${anonPosts.length}`)
await expectError('anonimo non crea post del portfolio', () => as(null, () => q(`insert into portfolio_posts (team_name, image_path) values ('x', 'x')`)))
await expectError('cliente non crea post del portfolio', () => as(c1.id, () => q(`insert into portfolio_posts (team_name, image_path) values ('x', 'x')`)))
await expectError('link al post solo https', () => as(admin.id, () => q(`insert into portfolio_posts (team_name, image_path, post_url) values ('x', 'x', 'javascript:alert(1)')`)), 'check')
const [{ unit }] = await as(null, () => q(`select compute_unit_price($1, $2) unit`, [prod.id, JSON.stringify(config)]))
Number(unit) === 31.5 ? ok('compute_unit_price coerente con il client (31.50)') : fail(unit)

console.log('\nDashboard: riepilogo per periodo')
{
  const period = async (days) => (await as(admin.id, () => q(`select admin_dashboard_period($1) v`, [days])))[0].v
  const [{ n: allOrders }] = await q(`select count(*)::int n from orders where kind = 'order'`)
  const p30 = await period(30)
  p30.orders === allOrders && p30.bucket === 'day' && p30.series.length === 30
    ? ok(`30 giorni: ${p30.orders} ordini, serie giornaliera di 30 punti`) : fail(JSON.stringify({ orders: p30.orders, allOrders, bucket: p30.bucket, n: p30.series.length }))
  p30.series.reduce((a, s) => a + s.count, 0) === p30.orders ? ok('la serie somma al totale del periodo') : fail('serie incoerente')
  // un ordine spostato a 100 giorni fa esce dai 30 giorni ma rientra nei 6 mesi
  await q(`update orders set created_at = now() - interval '100 days' where id = $1`, [order.order_id])
  const [p30b, p180, p365] = [await period(30), await period(180), await period(365)]
  p30b.orders === allOrders - 1 && p180.orders === allOrders ? ok('il periodo filtra per data di creazione') : fail(JSON.stringify({ p30: p30b.orders, p180: p180.orders, allOrders }))
  p180.bucket === 'week' && p365.bucket === 'month' && p365.series.length >= 12 ? ok('unità del grafico: settimane fino a 6 mesi, mesi oltre') : fail(`${p180.bucket}/${p365.bucket}/${p365.series.length}`)
  await q(`update orders set created_at = now() where id = $1`, [order.order_id])
  await expectError('periodo fuori intervallo rifiutato', () => as(admin.id, () => q(`select admin_dashboard_period(0)`)), 'invalid_period')
  await expectError('cliente non legge il riepilogo', () => as(c1.id, () => q(`select admin_dashboard_period(30)`)))
}

console.log('\nCartamodelli')
{
  const outline = JSON.stringify([[0, 0], [500, 0], [500, 700], [0, 700]])
  const [set] = await as(admin.id, () => q(`insert into pattern_sets (product_id, reference_size) values ($1, 'M') returning id`, [prod.id]))
  await as(admin.id, () => q(`insert into pattern_pieces (pattern_set_id, size, piece, name, outline, anchor) values ($1, 'M', 'front', 'Davanti', $2, '{"x":250,"y":680}')`, [set.id, outline]))
  ok('admin crea cartamodello e pezzo')
  await expectError('un solo cartamodello per prodotto', () => as(admin.id, () => q(`insert into pattern_sets (product_id) values ($1)`, [prod.id])), 'pattern_sets_unique')
  await expectError('contorno con meno di 3 punti rifiutato', () => as(admin.id, () => q(`insert into pattern_pieces (pattern_set_id, size, piece, name, outline) values ($1, 'M', 'back', 'Dietro', '[[0,0],[1,1]]')`, [set.id])), 'check')
  const cust = await as(c1.id, () => q(`select id from pattern_pieces`))
  cust.length === 0 ? ok('cliente non legge i cartamodelli') : fail('LEAK cartamodelli al cliente')
  await expectError('anonimo non legge i cartamodelli', () => as(null, () => q(`select id from pattern_sets`)))
}

console.log('\nLoghi e sponsor liberi')
{
  const zones = (await as(null, () => q(`select product_print_zones($1) z`, [prod.id])))[0].z
  zones.length === 1 && zones[0].zone === 'front' && zones[0].size === 'M' ? ok('zone di stampa pubbliche: solo i pezzi della taglia di riferimento') : fail(JSON.stringify(zones))
  const el = (kind, zone, path, widthCm = 10) => ({ id: kind + zone, kind, zone, asset: { bucket: 'customer-uploads', path, name: 'a.png' }, xCm: 0, yCm: 8, widthCm, rotation: 0 })
  const cfg = (elements) => ({ ...config, roster: [{ id: '1', size: 'M', quantity: 1 }, { id: '2', size: 'L', quantity: 1 }], elements })
  const two = [el('logo', 'front', `${c1.id}/graphics/l.png`), el('sponsor', 'sleeve_left', `${c1.id}/graphics/s.png`)]
  const place = (c) => as(c1.id, async () => {
    await q(`delete from cart_items`)
    const [cart] = await q(`select id from carts where user_id=$1`, [c1.id])
    await q(`insert into cart_items (cart_id, product_id, configuration, quantity) values ($1, $2, $3, 1)`, [cart.id, prod.id, JSON.stringify(c)])
    return (await q(`select * from place_order('cash_on_delivery', $1)`, [JSON.stringify({ full_name: 'M', line1: 'V', city: 'B', postal_code: '70100' })]))[0]
  })
  await expectError('elementi rifiutati se il prodotto non li consente', () => place(cfg(two)), 'elements_not_allowed')
  await q(`update products set free_elements_max = 2, free_logo_price = 2, free_sponsor_price = 3.5 where id = $1`, [prod.id])
  const [{ unit }] = await as(null, () => q(`select compute_unit_price($1, $2) unit`, [prod.id, JSON.stringify(cfg(two))]))
  Number(unit) === 37 ? ok('prezzo: 31,50 + logo 2,00 + sponsor 3,50 = 37,00') : fail(`unit ${unit}`)
  await expectError('troppi elementi', () => place(cfg([...two, el('logo', 'back', `${c1.id}/graphics/x.png`)])), 'too_many_elements')
  await expectError('larghezza fuori dai limiti', () => place(cfg([el('logo', 'front', `${c1.id}/graphics/l.png`, 80)])), 'invalid_element')
  await q(`update products set free_zones = '{front,back}' where id = $1`, [prod.id])
  await expectError('zona non consentita', () => place(cfg(two)), 'invalid_element')
  await q(`update products set free_zones = '{front,back,sleeve_left,sleeve_right}' where id = $1`, [prod.id])
  await expectError('file di un altro utente rifiutato', () => place(cfg([el('logo', 'front', `${c2.id}/graphics/l.png`)])), 'invalid_asset_path')
  const o = await place(cfg(two))
  const rows = await q(`select area_name, area_type, side, asset_meta from order_item_customizations c join order_items i on i.id = c.order_item_id where i.order_id = $1 and (c.asset_meta->>'free')::boolean order by area_name`, [o.order_id])
  rows.length === 2 && rows[0].area_name === 'Logo 1' && rows[0].side === 'front' && rows[1].asset_meta.zone === 'sleeve_left' && rows[1].side === null && Number(rows[0].asset_meta.widthCm) === 10
    ? ok(`ordine ${o.reference}: elementi salvati con zona e misure in cm`) : fail(JSON.stringify(rows))
  const [{ subtotal }] = await q(`select subtotal from orders where id = $1`, [o.order_id])
  Number(subtotal) === 74 ? ok('totale ricalcolato dal DB con gli elementi (2 × 37,00)') : fail(`subtotal ${subtotal}`)
  await q(`update products set free_elements_max = 0, free_logo_price = 0, free_sponsor_price = 0 where id = $1`, [prod.id])
}

console.log('\nGrafica all-over, nuovi modelli e immagini per colore')
{
  const asset = (p) => ({ bucket: 'customer-uploads', path: `${p}`, name: 'g.png' })
  const cfg = (allOver) => ({ ...config, roster: [{ id: '1', size: 'M', quantity: 1 }, { id: '2', size: 'L', quantity: 1 }], allOver })
  const place = (c, product = prod.id) => as(c1.id, async () => {
    await q(`delete from cart_items`)
    const [cart] = await q(`select id from carts where user_id=$1`, [c1.id])
    await q(`insert into cart_items (cart_id, product_id, configuration, quantity) values ($1, $2, $3, 1)`, [cart.id, product, JSON.stringify(c)])
    return (await q(`select * from place_order('cash_on_delivery', $1)`, [JSON.stringify({ full_name: 'M', line1: 'V', city: 'B', postal_code: '70100' })]))[0]
  })
  const one = [{ asset: asset(`${c1.id}/graphics/all.png`), overrides: { back: asset(`${c1.id}/graphics/back.png`), sleeve_left: asset(`${c1.id}/graphics/sl.png`) } }]
  await expectError('all-over rifiutato se il prodotto non lo consente', () => place(cfg(one)), 'all_over_not_allowed')
  await q(`update products set all_over_enabled = true, all_over_price = 6 where id = $1`, [prod.id])
  const [{ unit }] = await as(null, () => q(`select compute_unit_price($1, $2) unit`, [prod.id, JSON.stringify(cfg(one))]))
  Number(unit) === 37.5 ? ok('prezzo: 31,50 + all-over 6,00 = 37,50') : fail(`unit ${unit}`)
  await expectError('sostituzione su un pezzo inesistente', () => place(cfg([{ asset: asset(`${c1.id}/graphics/all.png`), overrides: { collar: asset(`${c1.id}/graphics/x.png`) } }])), 'invalid_all_over')
  await expectError('due grafiche all-over sullo stesso capo', () => place(cfg([...one, ...one])), 'invalid_all_over')
  await expectError('componente indicato su un capo singolo', () => place(cfg([{ ...one[0], kitItemId: '00000000-0000-0000-0000-000000000000' }])), 'invalid_all_over')
  await expectError('file all-over di un altro utente', () => place(cfg([{ asset: asset(`${c2.id}/graphics/all.png`) }])), 'invalid_asset_path')
  await expectError('sostituzione con file di un altro utente', () => place(cfg([{ asset: asset(`${c1.id}/graphics/all.png`), overrides: { front: asset(`${c2.id}/x.png`) } }])), 'invalid_asset_path')
  const o = await place(cfg(one))
  const rows = await q(`select area_name, area_type, side, asset_path, asset_meta from order_item_customizations c join order_items i on i.id = c.order_item_id where i.order_id = $1 and c.area_type = 'all_over' order by area_name`, [o.order_id])
  rows.length === 3 && rows[0].area_name === 'Grafica all-over' && rows[0].side === null
    && rows[1].area_name === 'Grafica all-over · dietro' && rows[1].side === 'back' && rows[1].asset_path.endsWith('back.png')
    && rows[2].asset_meta.zone === 'sleeve_left' && rows[2].asset_meta.allOver === true
    ? ok(`ordine ${o.reference}: grafica all-over e sostituzioni salvate per pezzo`) : fail(JSON.stringify(rows))
  const [{ subtotal }] = await q(`select subtotal from orders where id = $1`, [o.order_id])
  Number(subtotal) === 75 ? ok('totale ricalcolato dal DB con l’all-over (2 × 37,50)') : fail(`subtotal ${subtotal}`)
  await q(`update products set all_over_enabled = false, all_over_price = 0 where id = $1`, [prod.id])

  // kit: una grafica per componente, componente obbligatorio e del kit
  const { kit, kitItem } = await as(admin.id, async () => {
    const [kit] = await q(`insert into products (name, slug, product_type, base_price, is_published, all_over_enabled, all_over_price) values ('Kit test', 'kit-test', 'kit', 30, true, true, 4) returning id`)
    const [kitItem] = await q(`insert into kit_items (kit_id, label, model_shape, sizes) values ($1, 'Pantalone tuta', 'track_pants', '{M}') returning id`, [kit.id])
    return { kit, kitItem }
  })
  ok('nuovi modelli 3D: componente "track_pants" accettato')
  const kitCfg = (allOver) => ({ version: 1, optionValueIds: [], areas: {}, roster: [{ id: '1', sizes: { [kitItem.id]: 'M' }, quantity: 1 }], allOver })
  await expectError('kit: all-over senza componente', () => place(kitCfg([{ asset: asset(`${c1.id}/graphics/k.png`) }]), kit.id), 'invalid_all_over')
  const ko = await place(kitCfg([{ kitItemId: kitItem.id, asset: asset(`${c1.id}/graphics/k.png`) }]), kit.id)
  const [krow] = await q(`select area_name from order_item_customizations c join order_items i on i.id = c.order_item_id where i.order_id = $1 and c.area_type = 'all_over'`, [ko.order_id])
  krow?.area_name === 'Grafica all-over · Pantalone tuta' ? ok('kit: grafica all-over per componente, con il nome del componente') : fail(JSON.stringify(krow))
  await q(`update kit_items set all_over_enabled = false where id = $1`, [kitItem.id])
  await expectError('kit: all-over su un componente non abilitato', () => place(kitCfg([{ kitItemId: kitItem.id, asset: asset(`${c1.id}/graphics/k.png`) }]), kit.id), 'invalid_all_over')
  await q(`update kit_items set all_over_enabled = true where id = $1`, [kitItem.id])
  await as(c1.id, () => q(`delete from cart_items`))

  // immagini per colore
  const [img] = await as(admin.id, () => q(`insert into product_images (product_id, storage_path, variant_id) values ($1, 'products/nero.webp', $2) returning id`, [prod.id, variant.id]))
  const pubImg = await as(null, () => q(`select variant_id from product_images where id = $1`, [img.id]))
  pubImg[0]?.variant_id === variant.id ? ok('immagine associata a un colore, leggibile dal pubblico') : fail(JSON.stringify(pubImg))
  const [otherVariant] = await as(admin.id, () => q(`insert into product_variants (product_id, name, color_hex) values ($1, 'Rosso', '#C62828') returning id`, [kit.id]))
  await expectError('immagine con il colore di un altro prodotto rifiutata', () => as(admin.id, () => q(`insert into product_images (product_id, storage_path, variant_id) values ($1, 'x.webp', $2)`, [prod.id, otherVariant.id])), 'image_variant_mismatch')
  await as(admin.id, () => q(`delete from product_variants where id = $1`, [variant.id]))
  const [afterDel] = await q(`select variant_id from product_images where id = $1`, [img.id])
  afterDel.variant_id === null ? ok('colore eliminato: l’immagine torna valida per tutti i colori') : fail(JSON.stringify(afterDel))
}

console.log('\nFornitura: disponibilità immediata / print-on-demand')
{
  const place = (c) => as(c1.id, async () => {
    await q(`delete from cart_items`)
    const [cart] = await q(`select id from carts where user_id=$1`, [c1.id])
    await q(`insert into cart_items (cart_id, product_id, configuration, quantity) values ($1, $2, $3, 1)`, [cart.id, prod.id, JSON.stringify(c)])
    return (await q(`select * from place_order('cash_on_delivery', $1)`, [JSON.stringify({ full_name: 'M', line1: 'V', city: 'B', postal_code: '70100' })]))[0]
  })
  const cfg = { ...config, variantId: null, roster: [{ id: '1', size: 'M', quantity: 1 }, { id: '2', size: 'L', quantity: 1 }] }
  const [{ supply_mode: def }] = await q(`select supply_mode from products where id = $1`, [prod.id])
  def === 'immediate' ? ok('prodotto in disponibilità immediata per impostazione predefinita') : fail(def)
  await as(admin.id, () => q(`update products set supply_mode = 'on_demand' where id = $1`, [prod.id]))
  const anon = await as(null, () => q(`select supply_mode from products where id = $1`, [prod.id]))
  anon[0]?.supply_mode === 'on_demand' ? ok('fornitura leggibile dal pubblico (sezioni del catalogo)') : fail(JSON.stringify(anon))
  const o = await place(cfg)
  const [it] = await q(`select supply_mode from order_items where order_id = $1`, [o.order_id])
  it.supply_mode === 'on_demand' ? ok('riga d’ordine marcata print-on-demand (da ordinare al fornitore)') : fail(JSON.stringify(it))
  const [dup2] = await as(admin.id, () => q(`select admin_duplicate_product($1) id`, [prod.id]))
  const [d2] = await q(`select supply_mode from products where id = $1`, [dup2.id])
  d2.supply_mode === 'on_demand' ? ok('la duplicazione copia la fornitura') : fail(JSON.stringify(d2))
  await as(admin.id, () => q(`update products set supply_mode = 'immediate' where id = $1`, [prod.id]))
  const [it2] = await q(`select supply_mode from order_items where order_id = $1`, [o.order_id])
  it2.supply_mode === 'on_demand' ? ok('la riga conserva la fornitura del momento dell’ordine') : fail(JSON.stringify(it2))
  await as(c1.id, () => q(`delete from cart_items`))
}

console.log('\nSeed dimostrativo')
await db.exec(fs.readFileSync(path.join(dir, '..', 'seed_demo.sql'), 'utf8'))
const [demo] = await q(`select p.is_published, (select count(*)::int from customization_areas a where a.product_id = p.id) areas from products p where slug = 'prodotto-dimostrativo'`)
demo && !demo.is_published && demo.areas === 5 ? ok('seed_demo.sql: prodotto di prova non pubblicato con 5 aree') : fail(JSON.stringify(demo))

console.log(failures ? `\n${failures} TEST FALLITI` : '\nTutti i test superati')
process.exit(failures ? 1 : 0)
