# New Major

Piattaforma web per la **personalizzazione e vendita di divise, abbigliamento e kit da gara sportivi**: sito pubblico, catalogo, configuratore con mockup 3D live, carrello e checkout (pagamento alla consegna o bonifico), area clienti con notifiche interne e backoffice completo.

- **Frontend**: React 19 + React Router 7 + TypeScript, Tailwind CSS, Vite
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Row Level Security, RPC)
- **3D**: React Three Fiber + Three.js (caricato solo nel configuratore)

Documentazione di dettaglio:

| Documento | Contenuto |
| --- | --- |
| [docs/DATABASE.md](docs/DATABASE.md) | Schema, ruoli, RLS, storage, funzioni RPC |
| [docs/CONFIGURATORE.md](docs/CONFIGURATORE.md) | Funzionamento del configuratore, aree, controllo qualità grafiche, prezzi |
| [docs/GUIDA_ADMIN.md](docs/GUIDA_ADMIN.md) | Guida rapida per l’amministratore |

---

## 1. Setup locale

Requisiti: **Node.js 20+** e un progetto **Supabase** (piano gratuito sufficiente).

```powershell
npm install
```

```powershell
Copy-Item .env.example .env
```

Compila `.env`:

| Variabile | Dove trovarla | Note |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → *Publishable key* (`sb_publishable_…`) | Chiave pubblica: la sicurezza è garantita dalle policy RLS. Per progetti con chiavi legacy si può usare `VITE_SUPABASE_ANON_KEY` |
| `VITE_SITE_URL` | URL pubblico del sito (es. `https://www.dominio.it`) | Canonical, Open Graph, sitemap |

> **Non inserire mai la `service_role` key nel frontend o nel file `.env` del sito.** Non serve a nessuna funzione della piattaforma.

```powershell
npm run dev
```

Il sito è disponibile su `http://localhost:5173`. Senza variabili Supabase l’app mostra una schermata di configurazione.

### Script disponibili

| Comando | Descrizione |
| --- | --- |
| `npm run dev` | Server di sviluppo |
| `npm run build` | Type-check + build di produzione in `dist/` |
| `npm run preview` | Anteprima della build |
| `npm run typecheck` | Solo controllo TypeScript |
| `npm run test:db` | Applica le migration su un Postgres embedded (PGlite) e verifica RLS, prezzi lato server e RPC (55 controlli; i privilegi dei ruoli replicano quelli di un progetto Supabase nuovo) |
| `npm run sitemap` | Genera `public/sitemap.xml` e `public/robots.txt` dai contenuti pubblicati |

## 2. Configurazione Supabase

### 2.1 Database

Esegui le migration **in ordine** (cartella `supabase/migrations`):

1. `20261119000001_schema.sql` – tabelle, enum, indici, trigger
2. `20261119000002_rls.sql` – ruoli, profili, Row Level Security
3. `20261119000003_functions.sql` – checkout, prezzi, funzioni admin, audit log
4. `20261119000004_storage.sql` – bucket e policy di Storage
5. `20261119000005_seed_base.sql` – stati ordine, tipologie capo (Smarcata, adidas, Mizuno), impostazioni con i dati aziendali, testi strutturali, pagine legali in bozza
6. `20261119000006_api_grants.sql` – privilegi espliciti per i ruoli `anon` e `authenticated` (i progetti Supabase recenti non li concedono più in automatico sulle nuove tabelle; senza questo file l’API risponde 401)

Due modi:

- **SQL Editor** (Dashboard → SQL Editor): incolla ed esegui ogni file nell’ordine indicato.
- **Supabase CLI**:

```powershell
npx supabase link --project-ref IL_TUO_PROJECT_REF
```

```powershell
npx supabase db push
```

Facoltativo: `supabase/seed_demo.sql` crea un **prodotto dimostrativo non pubblicato** (prezzi a 0) per provare subito il configuratore dal backoffice.

### 2.2 Autenticazione

Dashboard → Authentication:

- **URL Configuration** → *Site URL*: l’URL del sito; *Redirect URLs*: aggiungi `https://TUO-DOMINIO/accedi`, `https://TUO-DOMINIO/reimposta-password` e, in sviluppo, `http://localhost:5173/**`.
- **Providers → Email**: abilitato. “Confirm email” attivo è consigliato (l’app gestisce entrambi i casi).
- Le email di conferma e recupero password sono inviate dal servizio Auth nativo di Supabase. Per la produzione è consigliato configurare un SMTP proprio (Authentication → Emails → SMTP) per evitare i limiti del mittente predefinito.

### 2.3 Primo account amministratore

1. Registrati dal sito (`/registrati`) con l’email dell’amministratore e conferma l’account.
2. In Supabase → SQL Editor esegui (sostituendo l’email):

```sql
update public.profiles set role = 'admin' where email = 'admin@tuodominio.it';
```

3. Accedi al backoffice su `/admin` (oppure `/admin/accedi`).

Gli amministratori successivi si nominano dal backoffice: **Utenti → scheda utente → Ruolo**.

## 3. Deploy

Il progetto è una SPA statica (`dist/`). Sono inclusi i rewrite per il routing client-side:

- **Vercel**: `vercel.json` (già presente). Imposta le variabili `VITE_*` nel progetto.
- **Netlify**: `public/_redirects` (già presente).
- Altri hosting: reindirizza tutte le rotte a `index.html`.

Dopo il primo deploy esegui `npm run sitemap` (con le variabili di produzione) e ripubblica, oppure aggiungilo alla pipeline prima di `npm run build`.

## 4. Architettura del codice

```
src/
  app/              Router (rotte con code splitting) e schermata di setup
  components/ui/    Design system: Button, Form, Overlay (Modal/Drawer), Toast/Confirm, Tabs, Table, Dropzone, Display, Markdown
  components/layout Header, footer, banner cookie, layout pubblico
  features/
    auth/           AuthProvider, guardie di rotta, login/registrazione/recupero password
    catalog/        API catalogo, pagina catalogo con filtri, pagina prodotto, card
    configurator/   Hook di stato, viewer 3D, sagome capi, rendering pannelli, sezioni UI
    cart/           Carrello persistente (ospite → account), upload grafiche
    checkout/       Checkout e conferma ordine
    account/        Dashboard cliente: ordini, notifiche, profilo, indirizzi
    orders/         API ordini e componenti condivisi (avanzamento, dettaglio, bonifico)
    notifications/  API notifiche interne e contatore non lette
    content/        Home, Chi siamo, FAQ, Contatti, pagine CMS/legali, 404
    settings/       Impostazioni pubbliche (dati aziendali, pagamenti, qualità…)
    admin/          Backoffice completo
  hooks/            useQuery (cache SWR), useMeta (SEO), useDebounce/useMediaQuery
  lib/              Client Supabase, storage, prezzi, controllo qualità immagini, Markdown sicuro, formattazione, errori
  types/            Tipi del dominio e della configurazione
  styles/           Tailwind e token
supabase/
  migrations/       Schema, RLS, funzioni, storage, seed di base
  tests/            Test del database su PGlite
  seed_demo.sql     Dati dimostrativi facoltativi
scripts/            Generatore sitemap
docs/               Documentazione tecnica e operativa
```

## 5. Dipendenze e motivazione

| Pacchetto | Scopo |
| --- | --- |
| `react`, `react-dom` | UI |
| `react-router-dom` | Routing client-side con rotte lazy |
| `@supabase/supabase-js` | Database, autenticazione, storage |
| `three`, `@react-three/fiber` | Mockup 3D live del configuratore (chunk separato, caricato solo al bisogno) |
| `lucide-react` | Icone SVG (tree-shaking per icona) |
| `marked` | Rendering Markdown dei contenuti gestiti dall’admin |
| `dompurify` | Sanificazione HTML contro XSS dei contenuti Markdown |
| `@fontsource-variable/archivo`, `@fontsource-variable/inter` | Font self-hosted (nessuna richiesta a Google Fonts, conforme GDPR) |
| `tailwindcss`, `postcss`, `autoprefixer` | Styling (dev) |
| `typescript`, `vite`, `@vitejs/plugin-react`, `@types/*` | Build e tipi (dev) |
| `@electric-sql/pglite` | Postgres embedded per `npm run test:db` (dev) |

Nessuna libreria di stato globale, form o data-fetching: sono coperti da context React, componenti propri e un hook `useQuery` minimale con cache e invalidazione.

## 6. Sicurezza

- **RLS su tutte le tabelle**: i clienti leggono solo i propri dati (profilo, indirizzi, carrello, ordini, notifiche); gli admin hanno accesso completo tramite `is_admin()`.
- **Ordini creati solo via RPC** (`place_order`): prezzi, sconti e totali sono **ricalcolati dal database**; quantità minime, taglie, opzioni e aree obbligatorie sono validate lato server.
- I file dei clienti stanno in un bucket **privato** (`customer-uploads/{user_id}/…`); il checkout rifiuta percorsi di altri utenti. Gli admin accedono tramite URL firmati temporanei.
- Trigger che impediscono a un cliente di modificare ruolo/stato del proprio profilo o il contenuto delle notifiche.
- Contenuti dell’admin in Markdown, sanificati con DOMPurify prima del rendering.
- Nessuna `service_role` key nel frontend; vincoli di lunghezza/formato su tutti i campi testuali.
- Registro attività (audit log) per catalogo, ordini, contenuti, impostazioni e ruoli.

## 7. Funzionalità implementate

**Sito pubblico**: home gestibile (hero, prodotti in evidenza, sezioni, CTA, banner annunci) · Chi siamo e pagine legali da CMS · catalogo con categorie/sottocategorie, ricerca, filtri (tipologia maglia, tipo, disponibilità, attributi configurabili), ordinamento · pagina prodotto dinamica con galleria, dati strutturati JSON-LD, prodotti correlati · FAQ con ricerca · Contattaci con richieste salvate nel database · banner cookie · SEO (title/description/OG/canonical dinamici, sitemap, robots).

**Configuratore**: tipologia capo (Smarcata, adidas, Mizuno… gestibili), colore base con profili, opzioni con sovrapprezzi, loghi/sponsor/grafiche all-over (upload o libreria), nomi e numeri con stile, roster per giocatore con taglie e quantità (anche incolla da Excel), kit composti con taglie per componente, mockup 3D live fronte/retro + vista 2D, **controllo qualità delle grafiche** (DPI effettivi alla dimensione di stampa, avviso sotto 300 dpi, conferma esplicita del cliente, trasparenza, formato e peso), riepilogo prezzi con sconti a scaglioni, anteprime salvate con l’ordine.

**Carrello e checkout**: carrello ospite (locale) sincronizzato nell’account al login con upload delle grafiche · modifica configurazioni · indirizzi salvati · fatturazione · pagamento alla consegna o bonifico con istruzioni (IBAN da backoffice) · riferimento ordine `NM26-00001`.

**Area clienti**: ordini con barra di avanzamento e storico, richiesta di aggiornamento (limitata a una ogni 12 ore), notifiche interne lette/non lette, dati personali, cambio password, indirizzi.

**Backoffice**: dashboard con statistiche e grafico · ordini (filtri, stato con notifica e promemoria automatico, pagamento, spese di spedizione, note interne, download dei file originali) · ordini manuali / preventivi / test con configuratore interno e prezzi liberi · prodotti (duplicazione, archivio, immagini drag & drop con ottimizzazione e sostituzione, tipologie, colori, opzioni, editor visuale delle aree, componenti kit, sconti, correlati, attributi, SEO) · categorie · tipologie capo · libreria grafiche · home e banner · pagine · FAQ · media · utenti (ruolo, attivazione) · notifiche/comunicazioni · promemoria · richieste di contatto · stati ordine configurabili · impostazioni · registro attività.

## 8. Semplificazioni e punti da completare

- **Modelli 3D**: le sagome (maglia manica corta/lunga, canotta, pantaloncino) sono generate proceduralmente; non è previsto il caricamento di modelli 3D specifici per brand.
- **Spedizione**: costo fisso (con soglia di gratuità) oppure “da definire” alla conferma; nessun calcolo per zona o peso.
- **Immagini responsive**: ottimizzazione lato browser al caricamento (WebP, lato max 2000 px); le trasformazioni server di Supabase richiedono il piano Pro.
- **Disattivazione utente**: blocca ordini e forza il logout lato app; la revoca server-side delle sessioni Auth richiederebbe una Edge Function con service role (non inclusa).
- **File dei clienti non ordinati** (es. grafiche rimosse dal carrello) restano nello storage: si possono eliminare periodicamente dalla dashboard Supabase.
- **SEO**: SPA senza pre-rendering; i metadati sono aggiornati lato client. Per un’indicizzazione più robusta valutare un pre-rendering delle pagine pubbliche.
- **Notifiche**: aggiornate a ogni focus della pagina e ogni 60 secondi (nessun realtime/push, come richiesto).
- **Testi legali**: bozze basate sulle policy del negozio Shopify e sul funzionamento della piattaforma, da far verificare a un consulente.
- **Email aziendale**: nelle impostazioni è precompilato `newmajorsrl08270@gmail.com`, ricavato dalle policy Shopify indicate come riferimento: verificarla o rimuoverla da **Impostazioni → Dati aziendali**.
- **IBAN e intestatario** del bonifico vanno inseriti in **Impostazioni → Bonifico bancario** (finché mancano, al cliente viene indicato che le coordinate saranno comunicate alla conferma).
- **21st.dev**: il server MCP non era collegato durante lo sviluppo; i componenti sono stati realizzati internamente seguendo i pattern e-commerce/landing/dashboard di riferimento.
