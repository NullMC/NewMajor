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

1. **Generale**: nome, slug, categoria, tipo (capo singolo o kit), prezzo base, quantità minima, disponibilità, **fornitura**, **modello 3D**, taglie, descrizioni, SEO. Salva. **Fornitura**: *Disponibilità immediata* (articolo a magazzino) oppure *Print-on-demand* (non stoccato: si ordina al fornitore quando arriva l’ordine). Il catalogo è diviso in queste due sezioni (schede *Tutto · Disponibilità immediata · Print-on-demand* in cima al catalogo, categorie e filtri valgono dentro ciascuna); gli articoli print-on-demand mostrano un badge e la nota “Articolo non stoccato: viene ordinato al fornitore al momento dell’ordine”. Negli ordini le loro righe sono segnate **“Print-on-demand · da ordinare al fornitore”** (la fornitura viene fissata al momento dell’ordine). Modelli 3D disponibili: **maglia manica corta e lunga, polo, felpa con cappuccio, giacca tuta, pantalone tuta, giubbotto, pantaloncino** (capi 3D reali su cui colori, grafiche, nomi e numeri vengono proiettati) e **canotta** (sagoma generata). Le aree di personalizzazione si posizionano sull’anteprima 2D, che ha la stessa sagoma del modello 3D. Se cambi il modello di un prodotto esistente, ricontrolla la posizione delle aree. Una tuta si crea come **kit** con i componenti *Giacca tuta* e *Pantalone tuta*. I crediti dei modelli sono nella pagina pubblica **/crediti** (link nel footer): non rimuoverla, la licenza dei modelli la richiede.
2. **Immagini**: trascina le foto; la prima è la principale (stella per cambiarla), frecce per l’ordine, testo alternativo per accessibilità/SEO. *Sostituisci* elimina automaticamente il file precedente. Le stesse foto si gestiscono anche da **Contenuti → Media**. Sotto ogni foto puoi scegliere un **colore** (o *Tutti i colori*): nella pagina prodotto, quando il cliente sceglie un colore, compaiono prima le foto di quel colore e poi quelle valide per tutti; se un colore non ha foto dedicate resta la galleria completa. Nel catalogo la principale fa da copertina e, passando il mouse sulla scheda, si sfogliano le prime 5; nella pagina prodotto si cambiano con frecce e miniature e si ingrandiscono tenendo premuto.
3. **Tipologie, colori, opzioni**: spunta le tipologie disponibili (sovrapprezzo specifico facoltativo), aggiungi i colori (principale + profili) e le opzioni con i relativi valori e sovrapprezzi.
4. **Aree personalizzazione**: aggiungi le aree (logo cuore, sponsor, all-over, nome retro, numero…). Indica sempre la **dimensione di stampa in cm**: serve a calcolare i DPI effettivi delle grafiche dei clienti. Posiziona le aree trascinandole nell’anteprima.
5. **Componenti kit** (solo kit): maglia, pantaloncino, calzettoni… con taglie e modello 3D. Nelle aree puoi indicare a quale componente si riferiscono.
6. **Sconti quantità**: es. da 15 pezzi −5%, da 30 pezzi −10%.
7. **Correlati**: prodotti suggeriti in fondo alla pagina.
**Articoli non personalizzabili** (interruttore *Personalizzabile* spento): il cliente può ordinarli neutri scegliendo taglie e quantità, oppure premere **Richiedi una consulenza**. Il modulo contatti si apre con l’articolo, il colore e una griglia taglie/quantità; prodotto, colore e taglie arrivano in testa al messaggio in **Richieste di contatto**.
8. Torna su **Generale** e attiva **Pubblicato**. Con **Anteprima** vedi la pagina come il cliente (anche in bozza).

Per creare un prodotto simile usa **Duplica** nell’elenco prodotti (copia tutto tranne le immagini, in bozza).

## Cartamodelli, loghi liberi e file di produzione

Il file di stampa usa i **cartamodelli reali** del capo. Senza cartamodello il prodotto si vende come prima, ma il PDF di produzione non è disponibile e i loghi/sponsor liberi non compaiono nel configuratore.

**1. Esportare dal CAD** (Gerber, Lectra, CLO, Optitex…): formato **DXF AAMA o ASTM**, con la linea di taglio sullo **strato 1** e, per ogni pezzo, i testi “Piece Name:”, “Size:” e “Quantity:”. In alternativa un **SVG in scala reale** (dimensioni del documento in mm o cm) con una forma chiusa per pezzo. Le tabelle di sviluppo taglie (grade rules) non vengono interpretate: esporta tutte le taglie già sviluppate (un file con tutte o un file per taglia).

**2. Importare**: prodotto → scheda **Cartamodelli** → *Importa cartamodello*. Controlla per ogni pezzo nome, **tipo** (davanti, dietro, manica sinistra/destra, collo, polsino, altro), **taglia** e **quantità**; una manica tagliata in coppia può diventare automaticamente sinistra + destra (specchiata). Le misure mostrate sono quelle lette dal file: verificale. Il file originale resta scaricabile (privato, solo admin).

**3. Punti di riferimento**: su ogni pezzo il punto oro è il riferimento da cui si misurano le grafiche: **centro collo** per davanti e dietro, **sommità della testa** per le maniche. Viene proposto in automatico; aprendo il pezzo puoi trascinarlo o scriverne le coordinate, e indicare l’angolo del drittofilo. Imposta la **taglia di riferimento** (quella mostrata al cliente nel configuratore). I controlli in alto segnalano taglie senza pezzi, davanti/dietro mancanti o una sola manica.

**4. Loghi e sponsor liberi**: sempre nella scheda Cartamodelli imposta numero massimo (0 = disattivati), prezzo per logo e per sponsor, larghezza minima e massima in cm e zone consentite. Il cliente li aggiunge e li trascina, ridimensiona e ruota sul pezzo reale; le misure sono in **centimetri reali dal punto di riferimento** e restano identiche su tutte le taglie. Il configuratore blocca gli elementi che escono dal pezzo, avvisa quelli a meno di 1,5 cm dalla cucitura e controlla i DPI alla larghezza di stampa.

**Grafica all-over**: è disattivata di default; attivala solo sugli articoli che la prevedono (ad esempio le magliette dei kit da calcio). Sempre nella scheda Cartamodelli attiva *Consenti grafica all-over* e indica il prezzo per capo (per i kit si applica a ogni componente che la usa; 0 = inclusa). Nei **kit** scegli anche i componenti su cui è consentita (es. solo *Maglia*, non *Pantaloncino*): negli altri il passo non compare. Il cliente carica una grafica che copre tutto il capo e, se vuole, una grafica diversa per davanti, dietro o maniche (le maniche solo se il cartamodello le ha); loghi, sponsor, nomi e numeri restano sopra. Con il cartamodello la risoluzione è controllata sulla misura reale dei pezzi della taglia di riferimento e nel PDF la grafica riempie ogni pezzo con l’abbondanza; collo e polsini restano nel colore dei profili. Nell’ordine trovi una riga *Grafica all-over* e una per ogni sostituzione, con i file nello ZIP.

**5. Dall’ordine** (dettaglio ordine, per ogni articolo):
- **Anteprima prodotto**: un’immagine unica con fronte, retro e maniche (se hanno grafiche).
- **File del cliente (ZIP)**: tutti i file originali con nomi chiari e un `riepilogo.txt` con zona, larghezza e posizione in cm di ogni elemento.
- **File di produzione (PDF)**: indica larghezza utile del rotolo, abbondanza, distanza tra i pezzi, lunghezza massima per pagina e se specchiare le pagine per la carta transfer (puoi farle ricordare). Il PDF contiene un foglio di riepilogo (roster, colori, metri di rotolo stimati, avvisi) e, in scala 1:1, i pezzi di **ogni giocatore nella sua taglia** con colore di fondo, grafiche all-over, loghi, sponsor, nome e numero, **abbondanza**, **linea di taglio sul colore spot “CutContour”** ed etichetta sotto ogni pezzo (sul tessuto di scarto). Nomi e numeri sono resi a 300 dpi con lo stesso carattere dell’anteprima; le immagini del cliente restano alla loro risoluzione originale. Le posizioni di nomi, numeri e loghi delle aree fisse sono ricavate sulla taglia di riferimento e riportate in cm sulle altre; colletti e polsini prendono il colore dei profili.

**Prima di andare in produzione — stampa di prova** (da fare con il primo cartamodello reale):
1. Genera il PDF di un ordine di prova con una sola taglia e aprilo al **100%** (non “adatta alla pagina”): misura con il righello del visualizzatore larghezza e altezza di un pezzo e confrontale con il cartamodello.
2. Controlla che logo e numero siano alla distanza attesa dal collo (es. 10 cm) su due taglie diverse.
3. Invia il PDF al RIP: verifica che riconosca la linea “CutContour” e se applica già la specchiatura (in quel caso lasciala disattivata qui).
4. Stampa e taglia **un solo pezzo**, sovrapponilo al cartamodello fisico e controlla taglio, abbondanza e posizione delle grafiche.
5. Solo dopo questa verifica usa i PDF per gli ordini reali.

## Dashboard

In alto a destra scegli il periodo del riepilogo: 7 giorni, 30 giorni, 3, 6, 12 o 24 mesi (la scelta resta memorizzata nel browser). Il periodo vale per numero e valore degli ordini (esclusi gli annullati), per il grafico (per giorno fino a 30 giorni, per settimana fino a 6 mesi, per mese oltre) e per “Ordini per stato”. Gli altri contatori (ordini in corso, bonifici, promemoria, richieste, clienti, prodotti) mostrano sempre la situazione attuale.

## Gestire gli ordini

- **Ordini**: filtri per stato, pagamento, tipo, date e ricerca (riferimento, nome, email, telefono).
- Nel dettaglio trovi anteprime, personalizzazioni con **download del file originale** (per loghi e sponsor liberi anche zona, misura e posizione in cm), i download per la produzione (vedi *Cartamodelli, loghi liberi e file di produzione*), qualità delle grafiche (e se il cliente ha accettato una qualità bassa), roster con nomi/numeri/taglie, indirizzi, note.
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

- **Home e banner**: banner annunci in cima al sito, hero, sezioni, prodotti in evidenza. Una sezione senza titolo non viene mostrata. Senza immagine hero, la home mostra la foto predefinita dell’esposizione (`public/hero/showroom.webp`) sulla destra, sfumata verso sinistra nello sfondo scuro (su mobile sotto i testi); caricando un’immagine da **Immagine hero**, questa la sostituisce con la stessa sfumatura. Per un risultato nitido usa una foto di almeno 1600 px di larghezza. L’ultima parola dei titoli della home è resa in corsivo; i punti di “Personalizzazione” scorrono a tutta larghezza, “Come funziona” avanza con lo scroll. Con almeno 3 prodotti in evidenza, la home li mostra su un nastro curvo. Prima dei box finali c’è l’**avviso qualità grafiche**: spiega che grafiche piccole o generate con l’AI senza cura possono dare stampe sgranate, mostra un confronto trascinabile tra stampa da file piccolo e da file curato e invita a richiedere una consulenza (il modulo contatti si apre con l’oggetto già compilato). Titolo, testo e punti si modificano in **Home e banner → Avviso qualità grafiche**; lasciando vuoto il titolo l’avviso sparisce. Le soglie DPI di **Impostazioni → Controllo qualità grafiche** non compaiono in home: il configuratore le usa per avvisare il cliente dopo il caricamento di una grafica.
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
