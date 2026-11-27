# Database Supabase

Schema in `supabase/migrations`. Tutte le tabelle hanno RLS attiva; gli amministratori (`profiles.role = 'admin'`) hanno accesso completo tramite la funzione `is_admin()`.

## Ruoli

| Ruolo | Come si ottiene | Accesso |
| --- | --- | --- |
| `anon` | visitatore non autenticato | lettura di catalogo pubblicato, contenuti, FAQ, impostazioni pubbliche; invio richieste di contatto |
| `customer` | registrazione | come `anon` + propri profilo, indirizzi, carrello, ordini, notifiche; checkout via RPC |
| `admin` | `profiles.role = 'admin'` | tutto |

Un ruolo `staff` separato non è stato introdotto: non necessario per i requisiti attuali.

## Tabelle

### Utenti
- **profiles** – 1:1 con `auth.users` (creato dal trigger `handle_new_user`). Nome utente di accesso (univoco), email di contatto (facoltativa: vuota per chi si registra solo con il nome utente; l’indirizzo tecnico `@utenti.newmajor.invalid` di Supabase Auth non viene copiato), ruolo, stato attivo, dati fiscali. Il trigger `protect_profile_fields` impedisce ai clienti di cambiare ruolo/stato, a chiunque dall’app di cambiare il nome utente e agli admin di togliersi il ruolo.
- **addresses** – indirizzi salvati del cliente (predefinito di spedizione).

### Catalogo
- **categories** – albero a un livello (`parent_id`), soft delete.
- **garment_types** – tipologie/brand di capo (Smarcata, adidas, Mizuno…) con sovrapprezzo predefinito.
- **products** – prodotto semplice o kit: prezzo base, disponibilità, modello 3D (`model_shape`), taglie, quantità minima, attributi filtrabili (`jsonb`), SEO, pubblicazione, soft delete.
- **product_garment_types** – tipologie ammesse per prodotto, con sovrapprezzo specifico opzionale.
- **product_variants** – colori base (principale + profili) con sovrapprezzo.
- **product_options** / **product_option_values** – opzioni generiche (tessuto, collo…), obbligatorie o multiple.
- **product_images** – immagini con ordine, testo alternativo, una sola principale (indice univoco parziale).
- **customization_areas** – aree di personalizzazione: lato, tipo (`logo`, `sponsor`, `all_over`, `text`, `number`), posizione in % del pannello, **dimensione di stampa in cm** (per i DPI effettivi), sovrapprezzo, obbligatorietà, componente kit.
- **customization_assets** – libreria grafiche dell’admin (file originali, non compressi).
- **print_techniques** – tecniche di stampa (serigrafia, DTF, ricamo, sublimazione) con prezzo minimo e massimo per area; la sublimazione solo con grafica all-over.
- **print_zones** – area massima di stampa per prodotto/componente e zona (rettangolo in cm dal riferimento del pezzo), numero massimo di aree, grafiche/testi, tecniche ammesse.
- **kit_items** – componenti di un kit (maglia, pantaloncino…), con taglie e modello 3D propri. Prodotti e componenti hanno anche le impostazioni delle fasce (`band_enabled`, `band_height_cm`, `band_price`). *(Il kit è un `product` con `product_type = 'kit'`: non serve una tabella `kits` separata.)*
- **price_tiers** – sconti percentuali per quantità.
- **related_products**, **featured_products** – correlati e prodotti in evidenza in home.

### Carrello
- **carts** (uno per utente) e **cart_items** (prodotto + `configuration jsonb` + quantità).

### Ordini
- **order_statuses** – stati configurabili con percentuale di avanzamento, stato iniziale/finale/annullato.
- **orders** – riferimento `NMAA-00000`, tipo (`order`, `quote`, `test`), stato, metodo e stato di pagamento, dati cliente, indirizzi (snapshot `jsonb`), note, totali.
- **order_items** – snapshot del prodotto, configurazione completa, prezzi calcolati dal DB.
- **order_item_customizations** – personalizzazioni materializzate con riferimento al file e metadati qualità.
- **order_item_roster** – nomi, numeri, taglie e quantità per capo.
- **order_status_history** – storico stati (nota visibile al cliente).
- **order_internal_notes** – note interne (solo admin). *Separate da `orders` perché il cliente può leggere la propria riga ordine.*

### Comunicazioni e contenuti
- **notifications** – notifiche interne per utente (tipo, titolo, messaggio, link interno, letta). Il cliente può solo segnarle come lette o eliminarle.
- **contact_requests** – richieste dal modulo contatti.
- **pages** – Chi siamo, pagine legali (`kind = 'legal'`) e pagine libere in Markdown. *(Unifica `pages` e `legal_pages`.)*
- **site_content** – blocchi JSON della home e banner (`home.hero`, `home.sections`, `home.featured`, `site.banner`).
- **faqs**, **settings** (chiave/valore JSON, `is_public`), **media** (libreria immagini del sito).

### Backoffice
- **admin_reminders** – promemoria (automatici e manuali).
- **audit_logs** – registro modifiche (trigger su catalogo, ordini, contenuti, impostazioni, profili).

## Funzioni (RPC)

| Funzione | Chi | Descrizione |
| --- | --- | --- |
| `place_order(payment_method, shipping, billing, customer, notes)` | cliente | Crea l’ordine dal carrello: richiede email e telefono (dal modulo o dal profilo, poi salvati nel profilo se mancanti), valida, **ricalcola prezzi**, materializza personalizzazioni e roster, svuota il carrello, notifica cliente e admin, crea un promemoria |
| `request_order_update(order, message)` | cliente | Richiesta di aggiornamento (max 1 ogni 12 ore) → promemoria + notifica admin |
| `username_available(username)` | tutti | Verifica formato e disponibilità del nome utente in registrazione |
| `compute_unit_price(product, config)` / `compute_line_total(product, config, qty)` | tutti | Prezzo unitario e totale riga (stessa logica di `src/lib/pricing.ts`) |
| `admin_set_order_status(order, status, note, notify, reminder)` | admin | Cambio stato + storico + notifica cliente + promemoria “contatta il cliente” |
| `admin_set_payment_status(order, status, notify)` | admin | Conferma manuale bonifico/pagamento |
| `admin_create_order(payload)` | admin | Ordini manuali, preventivi e test con prezzi liberi |
| `admin_send_notification(user_ids \| null, type, title, message, link)` | admin | Comunicazione a utenti selezionati o a tutti i clienti attivi |
| `admin_duplicate_product(id)` | admin | Duplica prodotto con varianti, opzioni, aree, kit, sconti (in bozza, senza immagini) |
| `admin_dashboard_stats()` | admin | Statistiche della dashboard |

## Prezzi

```
unitario = prezzo base
         + sovrapprezzo tipologia capo (specifico del prodotto o predefinito)
         + sovrapprezzo colore
         + somma valori opzione selezionati
         + somma aree di personalizzazione attivate
         + aree di stampa del cliente: min + (area / area massima della zona) × (max − min) della tecnica
         + fasce (prezzo per capo del prodotto o componente)
quantità = somma delle righe del roster (o quantità semplice)
totale   = unitario × quantità × (1 − sconto scaglione massimo raggiunto)
```

Il client mostra un’anteprima; il valore salvato nell’ordine è sempre quello calcolato dal database.

## Privilegi dei ruoli API

`20261119000006_api_grants.sql` concede `SELECT` a `anon` e `authenticated` su tutte le tabelle di `public`, `INSERT/UPDATE/DELETE` solo a `authenticated` e, per i visitatori, solo `INSERT` su `contact_requests`. Le righe effettivamente accessibili restano decise dalle policy RLS. Le funzioni interne (`materialize_order_item`, `next_order_reference`, `notify_admins`) non sono eseguibili dai client; `place_order` e `request_order_update` solo da utenti autenticati; le funzioni `admin_*` verificano il ruolo al loro interno.

## Storage

| Bucket | Visibilità | Contenuto | Scrittura |
| --- | --- | --- | --- |
| `public-media` | pubblico | immagini prodotti (`products/{id}/`), categorie, sito (`site/`, `library/`), libreria grafiche (`assets/`) | solo admin |
| `customer-uploads` | privato | grafiche e anteprime dei clienti (`{user_id}/graphics/`, `{user_id}/previews/`) | il proprietario nella propria cartella; lettura proprietario + admin; eliminazione solo admin |

Quando l’admin sostituisce o elimina un’immagine (prodotto, categoria, hero, media) il file precedente viene rimosso dallo storage.

## Test

`npm run test:db` applica le migration su PGlite con stub degli schemi `auth` e `storage` e verifica 68 scenari: creazione profili, bootstrap admin, protezione ruoli, visibilità catalogo, checkout con prezzo ricalcolato e sconto, quantità minima, taglie, percorsi file di altri utenti, isolamento tra clienti, note e promemoria riservati, notifiche, contatti, cambio stato, richieste di aggiornamento, pagamento, preventivi manuali, duplicazione, statistiche, audit log, contenuti pubblici, registrazione con nome utente (email facoltativa, email e telefono obbligatori all’ordine), seed dimostrativo.
