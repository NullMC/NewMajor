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
}

const AUTH: Record<string, string> = {
  'Invalid login credentials': 'Email o password non corretti.',
  'Email not confirmed': 'Conferma il tuo indirizzo email prima di accedere.',
  'User already registered': 'Esiste già un account con questa email.',
  'Password should be at least 6 characters': 'La password deve contenere almeno 6 caratteri.',
}

export function errorMessage(err: unknown): string {
  if (!err) return 'Si è verificato un errore.'
  const raw =
    typeof err === 'string'
      ? err
      : (err as { message?: string }).message ?? (err as { error_description?: string }).error_description ?? ''
  if (AUTH[raw]) return AUTH[raw]
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
