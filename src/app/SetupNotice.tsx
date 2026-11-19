/** Mostrato in sviluppo quando mancano le variabili d'ambiente Supabase. */
export function SetupNotice() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-ink-50 p-6">
      <div className="surface max-w-lg p-8">
        <img src="/brand/logo.png" alt="New Major" className="h-14 w-auto" />
        <h1 className="mt-6 text-2xl font-bold">Configurazione richiesta</h1>
        <p className="mt-3 text-ink-600">
          Imposta <code className="rounded bg-ink-100 px-1.5 py-0.5 text-sm">VITE_SUPABASE_URL</code> e{' '}
          <code className="rounded bg-ink-100 px-1.5 py-0.5 text-sm">VITE_SUPABASE_ANON_KEY</code> in un file{' '}
          <code className="rounded bg-ink-100 px-1.5 py-0.5 text-sm">.env</code> (vedi <code>.env.example</code>) e riavvia il server.
        </p>
        <p className="mt-3 text-sm text-ink-500">Le istruzioni complete sono nel README.</p>
      </div>
    </main>
  )
}
