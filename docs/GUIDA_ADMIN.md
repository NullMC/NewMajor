# Guida rapida per l’amministratore

Accesso: **/admin** con nome utente (o email) e password di un account amministratore.

Gli amministratori non usano l’area cliente: accedendo dal sito, dall’icona nell’intestazione o da un link dell’area personale vengono portati direttamente alla pagina corrispondente del backoffice. Nome, email, telefono e password si modificano da **Il mio account** (menu laterale o nome in alto a destra). Se il ruolo di un account cambia mentre è collegato, il sito se ne accorge al ritorno sulla scheda.

## Primi passi

1. **Impostazioni → Dati aziendali**: verifica i dati (sede, P. IVA, REA, telefoni). Controlla l’email precompilata.
2. **Impostazioni → Bonifico bancario**: inserisci intestatario e IBAN (mostrati al cliente dopo l’ordine con bonifico).
3. **Impostazioni → Spedizione**: “da definire alla conferma” oppure costo fisso (con soglia di gratuità).
4. **Sistema → Pagine**: rivedi “Chi siamo” e le pagine legali (bozze da far verificare a un consulente).
5. **Categorie** e **Tipologie capo**: crea la struttura del catalogo.
6. **Prodotti → Nuovo prodotto**: crea il primo prodotto (vedi sotto) e pubblicalo.
7. **Home e banner**: testi della home, immagine hero facoltativa, prodotti in evidenza.

## Creare un prodotto personalizzabile

1. **Generale**: nome, slug, categoria, tipo (capo singolo o kit), prezzo base, quantità minima, disponibilità, **modello 3D**, taglie, descrizioni, SEO. Salva.
2. **Immagini**: trascina le foto; la prima è la principale (stella per cambiarla), frecce per l’ordine, testo alternativo per accessibilità/SEO. *Sostituisci* elimina automaticamente il file precedente. Le stesse foto si gestiscono anche da **Contenuti → Media**. Nel catalogo la principale fa da copertina e, passando il mouse sulla scheda, si sfogliano le prime 5; nella pagina prodotto si cambiano con frecce e miniature e si ingrandiscono tenendo premuto.
3. **Tipologie, colori, opzioni**: spunta le tipologie disponibili (sovrapprezzo specifico facoltativo), aggiungi i colori (principale + profili) e le opzioni con i relativi valori e sovrapprezzi.
4. **Aree personalizzazione**: aggiungi le aree (logo cuore, sponsor, all-over, nome retro, numero…). Indica sempre la **dimensione di stampa in cm**: serve a calcolare i DPI effettivi delle grafiche dei clienti. Posiziona le aree trascinandole nell’anteprima.
5. **Componenti kit** (solo kit): maglia, pantaloncino, calzettoni… con taglie e modello 3D. Nelle aree puoi indicare a quale componente si riferiscono.
6. **Sconti quantità**: es. da 15 pezzi −5%, da 30 pezzi −10%.
7. **Correlati**: prodotti suggeriti in fondo alla pagina.
8. Torna su **Generale** e attiva **Pubblicato**. Con **Anteprima** vedi la pagina come il cliente (anche in bozza).

Per creare un prodotto simile usa **Duplica** nell’elenco prodotti (copia tutto tranne le immagini, in bozza).

## Gestire gli ordini

- **Ordini**: filtri per stato, pagamento, tipo, date e ricerca (riferimento, nome, email, telefono).
- Nel dettaglio trovi anteprime, personalizzazioni con **download del file originale**, qualità delle grafiche (e se il cliente ha accettato una qualità bassa), roster con nomi/numeri/taglie, indirizzi, note.
- **Aggiorna stato**: scegli lo stato (la barra di avanzamento del cliente si aggiorna), aggiungi un messaggio facoltativo; puoi notificare il cliente e creare un promemoria per contattarlo.
- **Pagamento**: “Conferma pagamento ricevuto” quando arriva il bonifico (o all’incasso alla consegna).
- **Spedizione**: inserisci il costo se era “da definire”: il totale si aggiorna.
- **Note interne**: visibili solo allo staff.
- **Messaggio al cliente**: notifica interna collegata all’ordine.

## Ordini manuali, preventivi e test

**Ordini → Ordine / preventivo manuale**: collega un utente registrato (o inserisci i dati), aggiungi prodotti dal catalogo tramite il **configuratore interno** (anche prodotti non pubblicati) o **articoli su misura** con file e note, applica prezzi personalizzati, scegli tipo (preventivo, ordine, test), pagamento, stato iniziale e spedizione.

## Promemoria

Creati automaticamente per ogni nuovo ordine, cambio stato (se richiesto) e richiesta di aggiornamento del cliente. Spunta per completarli; puoi crearne di manuali collegati a un riferimento ordine. I promemoria aperti sono nella dashboard.

## Notifiche e comunicazioni

**Notifiche → Invia**: comunicazioni interne (avvisi, sconti, saldi, suggerimenti, avvertenze, messaggi) a tutti i clienti o a utenti selezionati, con link facoltativo. Nessuna email o push: il cliente le vede nell’area personale. **Le mie notifiche** raccoglie nuovi ordini e richieste di aggiornamento.

## Contenuti

- **Home e banner**: banner annunci in cima al sito, hero, sezioni, prodotti in evidenza. Una sezione senza titolo non viene mostrata. Senza immagine hero, la home mostra due maglie 3D appese a uno stender (si trascinano lungo l’asta; su mobile fluttuano tra i contenuti e si ruotano trascinandole); caricando un’immagine, questa le sostituisce. I file delle maglie sono in `public/hero/`. L’ultima parola dei titoli della home è resa in corsivo; i punti di “Personalizzazione” scorrono a tutta larghezza, “Come funziona” avanza con lo scroll. Con almeno 3 prodotti in evidenza, la home li mostra su un nastro curvo. Prima dei box finali c’è l’**avviso qualità grafiche**: spiega che grafiche piccole o generate con l’AI senza cura possono dare stampe sgranate, mostra un confronto trascinabile tra stampa da file piccolo e da file curato e invita a richiedere una consulenza (il modulo contatti si apre con l’oggetto già compilato). Titolo, testo e punti si modificano in **Home e banner → Avviso qualità grafiche**; lasciando vuoto il titolo l’avviso sparisce. Le soglie DPI di **Impostazioni → Controllo qualità grafiche** non compaiono in home: il configuratore le usa per avvisare il cliente dopo il caricamento di una grafica.
- **Portfolio**: i progetti realizzati, cioè i post in cui le squadre mostrano divise e kit. Per ogni post: squadra, immagine (obbligatorie), titolo, didascalia, link al post originale, piattaforma e data (facoltativi). Usa solo immagini che la squadra ha autorizzato a ripubblicare. I post pubblicati compaiono in home nell’ordine dell’elenco (frecce per spostarli), come polaroid a ventaglio; il post al centro si apre come la pagina di un diario. La sezione compare solo con almeno un post pubblicato e un titolo (da **Home e banner → Sezione portfolio**).
- **FAQ**: domande ordinabili, attivabili e raggruppabili per categoria.
- **Media**: le foto dei prodotti, raggruppate per prodotto (filtri: pubblicati, tutti, senza foto). Aprendo un prodotto puoi caricare foto, cambiarne l’ordine, scegliere la principale (copertina in catalogo), scrivere il testo alternativo, sostituirle o eliminarle: è lo stesso elenco della scheda **Immagini** del prodotto.
- **Libreria grafiche**: loghi, sponsor e pattern selezionabili dai clienti (file originali ad alta risoluzione).

## Utenti

Ricerca (nome utente, nome, email, telefono), scheda con ordini e indirizzi, cambio ruolo (cliente/amministratore), disattivazione account (l’utente viene disconnesso e non può ordinare).

I clienti si registrano con nome utente e password; email e telefono sono facoltativi in registrazione ma obbligatori per inviare un ordine. Chi si è registrato senza email non può recuperare la password da solo: vedi il README (sezione *Primo account amministratore*) per reimpostarla da SQL Editor.

## Impostazioni e sistema

- **Pagine** (Chi siamo e pagine legali): testo in Markdown (`## Titolo`, `**grassetto**`, `- elenco`, `[link](/catalogo)`), con anteprima. Le pagine di sistema (Chi siamo e legali) non si eliminano ma si possono mettere in bozza.
- **Stati ordine**: etichette, descrizioni per il cliente, percentuale di avanzamento, ordine, stato iniziale/finale/annullato.
- **Controllo qualità grafiche**: soglie DPI e dimensione massima dei file.
- **Filtri del catalogo**: attributi extra (es. Sport) il cui valore si imposta nella scheda prodotto.
- **Banner cookie**: testo e link alla cookie policy.
- **Registro attività**: chi ha modificato cosa e quando.
