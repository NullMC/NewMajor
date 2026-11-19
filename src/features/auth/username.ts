// Accesso con nome utente: Supabase Auth richiede un'email, quindi chi si registra senza email
// riceve un indirizzo tecnico sul dominio riservato .invalid (nessuna email può esservi recapitata).
// Deve coincidere con public.username_email_domain() (migration *_username_signup.sql).
export const USERNAME_EMAIL_DOMAIN = 'utenti.newmajor.invalid'
export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/
export const USERNAME_HINT = 'Da 3 a 30 caratteri: lettere minuscole, numeri, punto, trattino o trattino basso.'

export const normalizeUsername = (v: string) => v.trim().toLowerCase()
export const usernameToEmail = (username: string) => `${normalizeUsername(username)}@${USERNAME_EMAIL_DOMAIN}`
export const isUsernameEmail = (email: string | null | undefined) => !!email && email.toLowerCase().endsWith(`@${USERNAME_EMAIL_DOMAIN}`)
