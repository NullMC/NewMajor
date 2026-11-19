import { useCallback, useEffect, useRef, useState } from 'react'

// Cache minimale "stale-while-revalidate" per i dati letti da Supabase.
// Evita una dipendenza esterna (react-query) mantenendo caching e invalidazione per prefisso.

interface Entry { data: unknown; at: number }
const cache = new Map<string, Entry>()
const listeners = new Map<string, Set<() => void>>()

export function invalidate(prefix: string) {
  for (const key of [...cache.keys()]) if (key.startsWith(prefix)) cache.delete(key)
  for (const [key, set] of listeners) if (key.startsWith(prefix)) set.forEach((fn) => fn())
}

export interface QueryResult<T> {
  data: T | undefined
  error: unknown
  loading: boolean
  reload: () => Promise<void>
  setData: (updater: T | ((prev: T | undefined) => T)) => void
}

export function useQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  { staleMs = 30_000 }: { staleMs?: number } = {},
): QueryResult<T> {
  const cached = key ? (cache.get(key) as Entry | undefined) : undefined
  const [data, setDataState] = useState<T | undefined>(cached?.data as T | undefined)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState<boolean>(!!key && !cached)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const run = useCallback(async () => {
    if (!key) return
    setLoading((l) => l || !cache.has(key))
    try {
      const result = await fetcherRef.current()
      cache.set(key, { data: result, at: Date.now() })
      setDataState(result)
      setError(null)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [key])

  useEffect(() => {
    if (!key) {
      setLoading(false)
      return
    }
    const hit = cache.get(key)
    if (hit) {
      setDataState(hit.data as T)
      setLoading(false)
    }
    if (!hit || Date.now() - hit.at > staleMs) void run()
    const set = listeners.get(key) ?? new Set()
    set.add(run)
    listeners.set(key, set)
    return () => { set.delete(run) }
  }, [key, run, staleMs])

  const setData = useCallback(
    (updater: T | ((prev: T | undefined) => T)) => {
      setDataState((prev) => {
        const next = typeof updater === 'function' ? (updater as (p: T | undefined) => T)(prev) : updater
        if (key) cache.set(key, { data: next, at: Date.now() })
        return next
      })
    },
    [key],
  )

  return { data, error, loading, reload: run, setData }
}
