-- Privilegi espliciti per i ruoli dell'API (anon = visitatore, authenticated = utente con sessione).
-- I progetti Supabase recenti non concedono più in automatico SELECT/INSERT/UPDATE/DELETE
-- sulle nuove tabelle dello schema public: senza queste righe l'API risponde 401/42501.
-- Quali righe si possono leggere o modificare resta deciso dalle policy RLS (attive su tutte le tabelle).

grant usage on schema public to anon, authenticated;

grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
-- Unica scrittura dei visitatori: modulo contatti (policy contact_requests_insert).
grant insert on public.contact_requests to anon;

-- Stesse regole per le tabelle create da migration future.
alter default privileges for role postgres in schema public grant select on tables to anon, authenticated;
alter default privileges for role postgres in schema public grant insert, update, delete on tables to authenticated;
