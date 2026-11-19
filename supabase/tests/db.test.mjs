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
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
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
const [c1] = await q(`insert into auth.users (email, raw_user_meta_data) values ('c1@test.it', '{"full_name":"Mario Rossi","phone":"333"}') returning id`)
const [c2] = await q(`insert into auth.users (email) values ('c2@test.it') returning id`)
const profiles = await q(`select count(*)::int n from profiles`)
profiles[0].n === 3 ? ok('profili creati dal trigger') : fail('profili non creati')
await q(`update profiles set role = 'admin' where email = 'admin@test.it'`)
ok('bootstrap primo admin da SQL console')
await expectError('cliente non può diventare admin', () => as(c1.id, () => q(`update profiles set role='admin' where id=$1`, [c1.id])), 'forbidden_profile_change')
await as(c1.id, () => q(`update profiles set phone='334' where id=$1`, [c1.id]))
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

console.log('\nContenuti pubblici')
const pages = await as(null, () => q(`select slug from pages where kind='legal' order by sort_order`))
pages.length === 4 ? ok(`pagine legali: ${pages.map((p) => p.slug).join(', ')}`) : fail('pagine legali')
const pub = await as(null, () => q(`select key from settings order by key`))
pub.length === 7 ? ok('impostazioni pubbliche leggibili') : fail(`settings ${pub.length}`)
await expectError('anonimo non modifica impostazioni', async () => {
  const r = await as(null, () => q(`update settings set value='{}' where key='company' returning key`))
  if (!r.length) throw new Error('0 righe (RLS)')
})
const [{ unit }] = await as(null, () => q(`select compute_unit_price($1, $2) unit`, [prod.id, JSON.stringify(config)]))
Number(unit) === 31.5 ? ok('compute_unit_price coerente con il client (31.50)') : fail(unit)

console.log('\nSeed dimostrativo')
await db.exec(fs.readFileSync(path.join(dir, '..', 'seed_demo.sql'), 'utf8'))
const [demo] = await q(`select p.is_published, (select count(*)::int from customization_areas a where a.product_id = p.id) areas from products p where slug = 'prodotto-dimostrativo'`)
demo && !demo.is_published && demo.areas === 5 ? ok('seed_demo.sql: prodotto di prova non pubblicato con 5 aree') : fail(JSON.stringify(demo))

console.log(failures ? `\n${failures} TEST FALLITI` : '\nTutti i test superati')
process.exit(failures ? 1 : 0)
