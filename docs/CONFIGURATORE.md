# Configuratore prodotti e kit

Rotta: `/prodotti/:slug/personalizza` (modifica di una riga del carrello: `?riga=<id>`).
Codice: `src/features/configurator`.

## Flusso del cliente

1. **Tipologia di capo** – le tipologie associate al prodotto (Smarcata, adidas, Mizuno…), con eventuale sovrapprezzo.
2. **Colore base** – varianti con colore principale e colore dei profili (collo, maniche, orli).
3. **Opzioni** – valori singoli o multipli, obbligatori o facoltativi.
4. **Loghi, sponsor e grafiche** – per ogni area: upload del file o scelta dalla libreria, scala nell’area, controllo qualità.
5. **Nomi, numeri, taglie e quantità** – attivazione delle aree testo/numero, una riga per capo (nome, numero, taglia o taglie per componente kit, quantità), importazione da elenco incollato, anteprima del giocatore selezionato sul mockup; stile (colore, contorno, carattere).
6. **Riepilogo** – dettaglio del prezzo, sconti quantità, indicazioni per la produzione → aggiunta al carrello.

Il cliente può configurare **senza account**: le grafiche restano nel browser (IndexedDB) e vengono caricate nel suo spazio privato al login, insieme al carrello.

## Mockup 3D

- Le sagome sono definite in `garment/shapes.ts` (maglia manica corta, manica lunga, canotta, pantaloncino) con scollo diverso tra fronte e retro.
- `garment/panel.ts` disegna i pannelli fronte e retro su canvas (colore, all-over, profili, loghi, sponsor, nomi, numeri, guide delle aree).
- `garment/GarmentViewer.tsx` genera due superfici con profondità calcolata dalla distanza dal bordo e le texturizza con i pannelli. Nessun modello da scaricare: il chunk 3D (~250 KB gzip) è caricato solo nel configuratore.
- Vista 2D alternativa (e automatica se il dispositivo non supporta WebGL).
- Le anteprime PNG fronte/retro senza guide vengono salvate con la riga del carrello e dell’ordine.

Le **coordinate delle aree** sono in percentuale del pannello: coincidono tra editor admin, mockup 3D, vista 2D e anteprime.

## Controllo qualità delle grafiche

Implementato in `src/lib/imageQuality.ts`.

- **Formati**: PNG, JPG, WebP, SVG. Peso massimo configurabile (predefinito 50 MB).
- **DPI effettivi** = pixel dell’immagine ÷ dimensione di stampa dell’area (in pollici). Per loghi/sponsor l’immagine viene adattata all’area (*contain*) e la scala scelta dal cliente aumenta i DPI; per le grafiche all-over l’immagine riempie l’area (*cover*).
- **Soglie** (Impostazioni → Controllo qualità): ≥ 300 dpi adeguata · tra 150 e 300 qualità limitata · < 150 insufficiente.
- Per ogni area il cliente vede i **pixel minimi consigliati** (es. 8×8 cm a 300 dpi → 945×945 px).
- I DPI dichiarati nei metadati (PNG `pHYs`, JPEG JFIF/EXIF) sono letti solo a titolo informativo: contano i pixel reali.
- **Trasparenza**: avviso se un logo/sponsor non ha sfondo trasparente (JPG o PNG pieno).
- **SVG**: considerati vettoriali, qualità ottimale.
- Con qualità limitata o insufficiente il cliente deve **confermare esplicitamente** prima di aggiungere al carrello; l’esito (DPI, qualità, conferma) viene salvato nell’ordine ed è visibile all’admin accanto al file originale scaricabile.

Un avviso permanente nella sezione grafiche ricorda che le grafiche devono avere almeno 300 dpi, altrimenti il prodotto risulterà di bassa qualità.

## Configurazione salvata

`src/types/config.ts` – riprodotta integralmente in `cart_items.configuration` e `order_items.configuration`:

```jsonc
{
  "version": 1,
  "garmentTypeId": "…", "variantId": "…", "optionValueIds": ["…"],
  "areas": { "<area_id>": { "enabled": true, "scale": 0.8, "asset": { "bucket": "customer-uploads", "path": "<user>/graphics/….png", "width": 2400, "height": 2400, "effectiveDpi": 381, "quality": "ok" } } },
  "roster": [{ "id": "…", "name": "ROSSI", "number": "10", "size": "M", "quantity": 1 }],
  "textStyle": { "color": "#FFFFFF", "outline": null, "font": "block" },
  "preview": { "front": "<user>/previews/….png", "back": "…" },
  "customDescription": "indicazioni per la produzione"
}
```

Al checkout il database materializza aree e roster in `order_item_customizations` e `order_item_roster`.

## Configurazione da parte dell’admin

Scheda prodotto → schede **Tipologie, colori, opzioni**, **Aree personalizzazione** (editor visuale trascinabile + campi), **Componenti kit**, **Sconti quantità**. Nessuna modifica al codice è necessaria per creare nuovi prodotti, kit, opzioni, aree o regole di prezzo.
