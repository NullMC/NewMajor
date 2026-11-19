-- =============================================================================
-- New Major — Dati di base (necessari al funzionamento)
-- =============================================================================
-- Nessun prodotto, prezzo o contenuto commerciale inventato: solo stati ordine,
-- tipologie capo indicate dal committente, impostazioni con i dati aziendali
-- forniti, testi strutturali modificabili dal backoffice.
-- =============================================================================

-- Stati ordine ------------------------------------------------------------------
insert into public.order_statuses (code, label, description, progress, sort_order, is_initial, is_final, is_cancelled) values
  ('pending_confirmation', 'In attesa di conferma', 'Abbiamo ricevuto il tuo ordine: lo stiamo verificando.', 5, 10, true, false, false),
  ('confirmed', 'Confermato', 'Il tuo ordine è stato confermato.', 15, 20, false, false, false),
  ('processing', 'In lavorazione', 'Stiamo preparando il tuo ordine.', 30, 30, false, false, false),
  ('customization', 'In personalizzazione', 'Stiamo applicando grafiche, loghi, nomi e numeri.', 50, 40, false, false, false),
  ('production', 'In produzione', 'Il tuo ordine è in produzione.', 70, 50, false, false, false),
  ('shipping', 'In spedizione', 'Il tuo ordine è stato affidato al corriere.', 90, 60, false, false, false),
  ('delivered', 'Consegnato', 'Il tuo ordine è stato consegnato.', 100, 70, false, true, false),
  ('cancelled', 'Annullato', 'L''ordine è stato annullato.', 0, 80, false, true, true)
on conflict (code) do nothing;

-- Tipologie capo indicate dal committente (prezzo aggiuntivo 0: da configurare) ---
insert into public.garment_types (name, brand, slug, sort_order) values
  ('Smarcata', 'Smarcata', 'smarcata', 10),
  ('adidas', 'adidas', 'adidas', 20),
  ('Mizuno', 'Mizuno', 'mizuno', 30)
on conflict (slug) do nothing;

-- Impostazioni -----------------------------------------------------------------
insert into public.settings (key, value, is_public) values
  ('company', jsonb_build_object(
      'name', 'New Major',
      'legal_address', 'Strada del Carro, 6 – 76011 Bisceglie (BT)',
      'alt_address', 'Via Vienna, 6 – Bisceglie (BT)',
      'show_alt_address', false,
      'vat_number', '08270870721',
      'rea', '616172',
      'phone', '080 3956180',
      'phone_alt', '+39 375 647 4412',
      'email', 'newmajorsrl08270@gmail.com'
    ), true),
  ('bank_transfer', jsonb_build_object(
      'account_holder', '',
      'iban', '',
      'bank_name', '',
      'bic', '',
      'instructions', 'Indica il riferimento ordine nella causale del bonifico.'
    ), true),
  ('payments', jsonb_build_object(
      'cash_on_delivery', jsonb_build_object('enabled', true, 'note', ''),
      'bank_transfer', jsonb_build_object('enabled', true, 'note', '')
    ), true),
  ('shipping', jsonb_build_object(
      'mode', 'quote',
      'amount', null,
      'free_over', null,
      'note', 'Il costo di spedizione viene comunicato alla conferma dell''ordine.'
    ), true),
  ('catalog', jsonb_build_object('filters', '[]'::jsonb), true),
  ('quality', jsonb_build_object('min_dpi', 300, 'warn_dpi', 150, 'max_file_mb', 50), true),
  ('cookie', jsonb_build_object(
      'text', 'Questo sito utilizza esclusivamente cookie e archiviazione locale tecnici, necessari per l''accesso all''account, il carrello e la memorizzazione delle tue preferenze.',
      'policy_link', '/cookie-policy'
    ), true)
on conflict (key) do nothing;

-- Contenuti home (testi strutturali modificabili) ----------------------------------
insert into public.site_content (key, value) values
  ('home.hero', jsonb_build_object(
      'title', 'Divise e kit da gara personalizzati',
      'subtitle', 'Scegli il capo, applica colori, loghi, sponsor, nomi e numeri e verifica il risultato in anteprima 3D prima di ordinare.',
      'cta_primary', jsonb_build_object('label', 'Personalizza ora', 'href', '/catalogo'),
      'cta_secondary', jsonb_build_object('label', 'Contattaci', 'href', '/contatti'),
      'image_path', null
    )),
  ('home.sections', jsonb_build_object(
      'personalization', jsonb_build_object(
        'title', 'Personalizzazione completa',
        'text', 'Ogni capo può essere configurato in base alle esigenze della tua squadra.',
        'points', jsonb_build_array(
          'Tipologia di capo e colore base',
          'Loghi, sponsor e grafiche all-over',
          'Nomi, numeri e taglie per ogni giocatore',
          'Anteprima 3D in tempo reale'
        )
      ),
      'process', jsonb_build_object(
        'title', 'Come funziona',
        'steps', jsonb_build_array(
          jsonb_build_object('title', 'Scegli il prodotto', 'text', 'Esplora il catalogo e seleziona il capo o il kit.'),
          jsonb_build_object('title', 'Personalizza', 'text', 'Carica le grafiche, scegli i colori e compila nomi, numeri e taglie.'),
          jsonb_build_object('title', 'Ordina', 'text', 'Paga alla consegna o con bonifico bancario.'),
          jsonb_build_object('title', 'Segui l''ordine', 'text', 'Controlla lo stato dalla tua area personale.')
        )
      ),
      'quality', jsonb_build_object(
        'title', 'Grafiche pronte per la stampa',
        'text', 'Il configuratore controlla dimensioni e risoluzione dei file caricati e ti avvisa se non sono adatti a una stampa di qualità (consigliati almeno 300 dpi alla dimensione di stampa).'
      ),
      'catalog_cta', jsonb_build_object('title', 'Esplora il catalogo', 'text', 'Trova il capo o il kit da personalizzare.'),
      'contact_cta', jsonb_build_object('title', 'Hai un progetto particolare?', 'text', 'Contattaci per richieste su misura o preventivi.')
    )),
  ('home.featured', jsonb_build_object('title', 'In evidenza', 'subtitle', '')),
  ('site.banner', jsonb_build_object('enabled', false, 'text', '', 'link', ''))
on conflict (key) do nothing;

-- FAQ basate sul funzionamento della piattaforma -----------------------------------
insert into public.faqs (question, answer, category, sort_order) values
  ('Quali metodi di pagamento sono disponibili?',
   'Puoi scegliere tra pagamento alla consegna e bonifico bancario. In caso di bonifico, le coordinate e le istruzioni sono riportate nel dettaglio dell''ordine dopo la conferma.',
   'Pagamenti', 10),
  ('Che risoluzione devono avere le grafiche caricate?',
   'Per una stampa di qualità le grafiche devono avere almeno 300 dpi alla dimensione di stampa. Il configuratore calcola la risoluzione effettiva di ogni file e ti avvisa se è insufficiente. I file vettoriali (SVG) non hanno questo limite.',
   'Personalizzazione', 20),
  ('Devo registrarmi per ordinare?',
   'Sì: per completare un ordine è necessario un account. Puoi però configurare i prodotti e aggiungerli al carrello anche prima di accedere.',
   'Ordini', 30),
  ('Come posso seguire il mio ordine?',
   'Dall''area personale trovi lo storico ordini, lo stato aggiornato con la barra di avanzamento e le notifiche. Puoi anche richiedere un aggiornamento direttamente dal dettaglio ordine.',
   'Ordini', 40)
on conflict do nothing;

-- Pagine -------------------------------------------------------------------------
insert into public.pages (slug, kind, title, excerpt, content, is_published, sort_order) values
('chi-siamo', 'page', 'Chi siamo',
 'New Major si occupa di personalizzazione e vendita di divise, abbigliamento e kit da gara sportivi.',
$md$New Major si occupa di **personalizzazione e vendita di divise, abbigliamento e kit da gara sportivi**.

Su questa piattaforma puoi scegliere il capo, configurarlo con colori, loghi, sponsor, nomi e numeri e verificare il risultato in anteprima 3D prima di ordinare.

## Dove siamo

Strada del Carro, 6 – 76011 Bisceglie (BT)

## Contatti

Info e ordini: 080 3956180
Telefono alternativo: +39 375 647 4412
$md$, true, 10),

('termini-e-condizioni', 'legal', 'Termini e condizioni', null,
$md$## 1. Titolare del sito

Il sito e la piattaforma di vendita sono gestiti da **New Major**, con sede legale in Strada del Carro, 6 – 76011 Bisceglie (BT), Partita IVA 08270870721, REA 616172. Telefono: 080 3956180.

## 2. Ambito di applicazione

Le presenti condizioni regolano l'utilizzo del sito e l'acquisto di prodotti, divise, abbigliamento e kit sportivi, anche personalizzati, tramite la piattaforma. Effettuando un ordine il cliente dichiara di aver letto e accettato le presenti condizioni.

## 3. Account

Per effettuare un ordine è necessario registrare un account. Il cliente è responsabile della correttezza dei dati inseriti e della riservatezza delle proprie credenziali.

## 4. Prodotti e personalizzazioni

Le anteprime, incluse quelle 3D generate dal configuratore, hanno valore indicativo: colori, proporzioni e posizionamento delle grafiche possono differire leggermente dal prodotto finito a causa delle impostazioni dello schermo e dei processi di stampa.

Il cliente garantisce di avere tutti i diritti necessari sulle grafiche, i loghi, i marchi e i testi caricati e solleva New Major da qualsiasi responsabilità verso terzi in merito al loro utilizzo. New Major può rifiutare personalizzazioni contrarie alla legge o lesive di diritti altrui.

Per un risultato di qualità le grafiche devono avere una risoluzione di almeno **300 dpi** alla dimensione di stampa. In caso di file con risoluzione inferiore, accettata dal cliente dopo l'avviso del configuratore, New Major non risponde della resa di stampa.

## 5. Prezzi

I prezzi sono indicati in euro. Il totale dell'ordine viene ricalcolato dal sistema al momento dell'invio. Eventuali costi di spedizione, se non indicati durante il checkout, vengono comunicati al cliente prima della conferma dell'ordine. In caso di errori evidenti di prezzo o di informazioni, New Major può annullare o correggere l'ordine informando il cliente.

## 6. Ordini e conferma

L'invio dell'ordine costituisce una proposta d'acquisto. Il contratto si intende concluso con la conferma da parte di New Major, che avviene dopo la verifica della configurazione e delle grafiche. Lo stato dell'ordine è consultabile nell'area personale del cliente.

## 7. Pagamento

Sono disponibili esclusivamente il **pagamento alla consegna** e il **bonifico bancario**. In caso di bonifico, le coordinate e la causale sono indicate nel dettaglio dell'ordine; l'ordine viene lavorato secondo quanto comunicato nella conferma.

## 8. Recesso, resi e rimborsi

I prodotti personalizzati su indicazione del cliente sono esclusi dal diritto di recesso ai sensi dell'art. 59, comma 1, lett. c) del Codice del Consumo. Per i prodotti non personalizzati si applica la [Politica di rimborso](/politica-rimborsi).

## 9. Responsabilità

New Major non è responsabile per ritardi o impedimenti dovuti a cause di forza maggiore o a fatti di terzi. Restano salvi i diritti riconosciuti al consumatore dalla legge, inclusa la garanzia legale di conformità.

## 10. Legge applicabile

Le presenti condizioni sono regolate dalla legge italiana. Per i consumatori resta competente il foro del luogo di residenza o domicilio del consumatore.

## 11. Modifiche

New Major può aggiornare le presenti condizioni. Agli ordini si applicano le condizioni in vigore al momento dell'invio.
$md$, true, 100),

('privacy-policy', 'legal', 'Privacy policy', null,
$md$## Titolare del trattamento

**New Major**, Strada del Carro, 6 – 76011 Bisceglie (BT), Partita IVA 08270870721. Telefono: 080 3956180.

## Dati trattati

- **Dati dell'account**: nome, email, telefono, eventuali dati aziendali e di fatturazione.
- **Indirizzi** di spedizione e fatturazione salvati.
- **Dati degli ordini**: prodotti, configurazioni, nomi e numeri dei giocatori, taglie, grafiche caricate.
- **Richieste di contatto** inviate tramite il modulo.
- **Dati tecnici** necessari al funzionamento del servizio (sessione di accesso, preferenze).

## Finalità e basi giuridiche

- Gestione dell'account, degli ordini, della produzione e della consegna — *esecuzione del contratto* (art. 6.1.b GDPR).
- Adempimenti contabili e fiscali — *obbligo legale* (art. 6.1.c GDPR).
- Risposta alle richieste di contatto — *misure precontrattuali / legittimo interesse*.
- Sicurezza della piattaforma e prevenzione di abusi — *legittimo interesse* (art. 6.1.f GDPR).

I dati non sono utilizzati per finalità di marketing né ceduti a terzi per finalità proprie.

## Conservazione

I dati dell'account sono conservati finché l'account resta attivo. I dati relativi agli ordini sono conservati per il tempo previsto dagli obblighi civilistici e fiscali. Le richieste di contatto sono conservate per il tempo necessario a gestirle.

## Destinatari

I dati sono trattati da personale autorizzato di New Major e da fornitori che agiscono come responsabili del trattamento, tra cui il fornitore dell'infrastruttura di database, autenticazione e archiviazione file (Supabase), il fornitore di hosting del sito e i corrieri incaricati della consegna.

## Diritti dell'interessato

Puoi esercitare in qualsiasi momento i diritti previsti dagli artt. 15–22 GDPR (accesso, rettifica, cancellazione, limitazione, portabilità, opposizione) contattando il titolare ai recapiti indicati. Hai inoltre diritto di proporre reclamo al Garante per la protezione dei dati personali.

## Minori

Il servizio non è rivolto ai minori di 18 anni. Gli ordini per squadre giovanili devono essere effettuati da un adulto responsabile.
$md$, true, 110),

('cookie-policy', 'legal', 'Cookie policy', null,
$md$## Cosa utilizziamo

Questo sito utilizza esclusivamente **cookie e archiviazione locale tecnici**, necessari al funzionamento del servizio:

| Nome | Finalità | Durata |
| --- | --- | --- |
| Sessione di accesso (Supabase) | Mantenere l'accesso all'account | Fino al logout o alla scadenza della sessione |
| Carrello ospite | Conservare i prodotti configurati prima dell'accesso | Fino allo svuotamento del carrello |
| Preferenza cookie | Ricordare la scelta espressa nel banner | 12 mesi |

Non utilizziamo cookie di profilazione, pubblicitari o di analisi di terze parti.

## Base giuridica

I cookie tecnici non richiedono il consenso (art. 122 del Codice Privacy e Linee guida del Garante del 10 giugno 2021). Il banner informa della loro presenza.

## Gestione

Puoi eliminare cookie e dati locali dalle impostazioni del tuo browser; in tal caso potresti dover accedere nuovamente e il carrello ospite verrà svuotato.
$md$, true, 120),

('politica-rimborsi', 'legal', 'Politica di rimborso', null,
$md$## Prodotti personalizzati

I prodotti realizzati o personalizzati su indicazione del cliente (grafiche, loghi, sponsor, nomi, numeri, colori su misura) **non possono essere restituiti**, salvo difetti di conformità, ai sensi dell'art. 59, comma 1, lett. c) del Codice del Consumo.

## Prodotti non personalizzati

Per i prodotti non personalizzati puoi richiedere il reso entro **30 giorni** dalla ricezione. Per gli ordini spediti nell'Unione Europea resta in ogni caso garantito il diritto di recesso entro 14 giorni senza obbligo di motivazione.

I prodotti devono essere restituiti nelle condizioni in cui sono stati ricevuti: non indossati, non utilizzati, con etichette e confezione originale, insieme alla prova d'acquisto.

## Come richiedere un reso

Contattaci tramite la pagina [Contattaci](/contatti) o al numero 080 3956180 indicando il riferimento dell'ordine. Se la richiesta viene accettata riceverai le istruzioni per la spedizione. Non vengono accettati resi inviati senza richiesta preventiva.

## Prodotti danneggiati o errati

Controlla l'ordine alla consegna. In caso di prodotto difettoso, danneggiato o non corrispondente contattaci subito, così da risolvere il problema.

## Rimborsi

Ricevuto e verificato il reso, ti comunicheremo l'esito. In caso di approvazione, il rimborso viene effettuato entro 10 giorni lavorativi tramite bonifico bancario sulle coordinate che ci indicherai.
$md$, true, 130)
on conflict (slug) do nothing;
