// Traduzione degli errori Supabase/Postgres in messaggi comprensibili.

const CODES: Record<string, (arg?: string, arg2?: string) => string> = {
  not_authenticated: () => 'Devi accedere per continuare.',
  account_disabled: () => 'Il tuo account è disattivato. Contattaci per assistenza.',
  invalid_shipping_address: () => 'Indirizzo di spedizione incompleto.',
  empty_cart: () => 'Il carrello è vuoto.',
  no_order_status_configured: () => 'Configurazione stati ordine mancante: contatta l’amministratore.',
  product_unavailable: (n) => `Il prodotto "${n}" non è più disponibile.`,
  product_out_of_stock: (n) => `Il prodotto "${n}" non è al momento disponibile.`,
  product_not_found: () => 'Prodotto non trovato.',
  min_quantity: (n, q) => `Quantità minima per "${n}": ${q} pezzi.`,
  garment_type_required: (n) => `Seleziona la tipologia di capo per "${n}".`,
  variant_required: (n) => `Seleziona il colore per "${n}".`,
  option_required: (n) => `Seleziona un valore per "${n}".`,
  area_required: (n) => `La personalizzazione "${n}" è obbligatoria.`,
  invalid_size: (n) => `Taglia non valida per "${n}".`,
  invalid_asset_path: () => 'Una delle grafiche caricate non è valida. Ricaricala e riprova.',
  invalid_preview_path: () => 'Anteprima non valida. Riprova.',
  order_not_found: () => 'Ordine non trovato.',
  update_request_too_soon: () => 'Hai già inviato una richiesta di aggiornamento di recente. Riprova più tardi.',
  forbidden: () => 'Non hai i permessi per questa operazione.',
  forbidden_profile_change: () => 'Non puoi modificare questi dati del profilo.',
  cannot_demote_self: () => 'Non puoi rimuovere il ruolo di amministratore al tuo account.',
  empty_items: () => 'Aggiungi almeno un articolo.',
  customer_name_required: () => 'Il nome del cliente è obbligatorio.',
  invalid_price: () => 'Prezzo non valido.',
  email_required: () => 'Inserisci un indirizzo email valido: è necessario per inviare l’ordine.',
  phone_required: () => 'Inserisci un numero di telefono valido: è necessario per inviare l’ordine.',
  unsupported_file_type: (kind) => kind === 'graphic'
    ? 'Formato non supportato: carica un file PNG, JPG, WebP o SVG.'
    : 'Formato immagine non supportato: usa JPG, PNG, WebP, AVIF o SVG.',
  file_too_large: (mb) => `Il file supera il limite di ${mb} MB.`,
  username_taken: () => 'Nome utente non disponibile: scegline un altro.',
  username_login_failed: () => 'Nome utente o password non corretti. Se in registrazione hai indicato l’email, prova ad accedere con quella.',
}

const AUTH: Record<string, string> = {
  'Invalid login credentials': 'Credenziali non corrette.',
  'Email not confirmed': 'Conferma il tuo indirizzo email prima di accedere.',
  'User already registered': 'Esiste già un account con questa email o questo nome utente.',
  'Password should be at least 6 characters': 'La password deve contenere almeno 6 caratteri.',
}

export function errorMessage(err: unknown): string {
  if (!err) return 'Si è verificato un errore.'
  const raw =
    typeof err === 'string'
      ? err
      : (err as { message?: string }).message ?? (err as { error_description?: string }).error_description ?? ''
  if (AUTH[raw]) return AUTH[raw]
  if (/^Email address ".*@utenti\.newmajor\.invalid" is invalid/.test(raw)) return 'Al momento non è possibile registrarsi senza email: inserisci un indirizzo email.'
  if (/^Email address ".*" is invalid/.test(raw)) return 'Indirizzo email non accettato: controlla di averlo scritto correttamente.'
  if (/maximum allowed size|Payload too large/i.test(raw)) return 'Il file è troppo grande per essere caricato.'
  if (/mime type .* is not supported|invalid_mime_type/i.test(raw)) return 'Formato file non supportato.'
  if (/Email address not authorized|error sending (confirmation|recovery) email/i.test(raw)) return 'Non è stato possibile inviare l’email. Contattaci per assistenza.'
  if (/Email (signups|logins) are disabled|email_provider_disabled/i.test(raw)) return 'Registrazione e accesso sono momentaneamente non disponibili. Contattaci per assistenza.'
  if (/rate limit/i.test(raw)) return 'Troppi tentativi in poco tempo. Riprova tra qualche minuto.'
  if (/Database error saving new user/i.test(raw)) return 'Registrazione non riuscita: il nome utente potrebbe essere già in uso. Riprova con un altro.'
  const [code, a, b] = raw.split(':')
  if (CODES[code]) return CODES[code](a, b)
  if (/duplicate key value.*slug/i.test(raw)) return 'Esiste già un elemento con questo slug.'
  if (/duplicate key/i.test(raw)) return 'Elemento già esistente.'
  if (/violates foreign key/i.test(raw)) return 'Elemento collegato ad altri dati: impossibile completare l’operazione.'
  if (/row-level security|permission denied|42501/i.test(raw)) return 'Non hai i permessi per questa operazione.'
  if (/Failed to fetch|NetworkError/i.test(raw)) return 'Connessione non disponibile. Controlla la rete e riprova.'
  if (/check constraint/i.test(raw)) return 'Alcuni dati non sono validi o superano la lunghezza consentita.'
  return raw || 'Si è verificato un errore.'
}
