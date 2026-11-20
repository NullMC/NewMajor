import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { uid } from '@/lib/slug'
import { configQuantity } from '@/lib/pricing'
import { blobStore } from '@/lib/idb'
import type { Configuration } from '@/types/config'
import { useAuth } from '@/features/auth/AuthProvider'
import { uploadPendingAssets, type PendingPreview } from './assets'

export interface CartLine {
  id: string
  productId: string
  configuration: Configuration
  quantity: number
  pendingPreview?: PendingPreview
  createdAt: string
}

interface CartContextValue {
  lines: CartLine[]
  count: number
  loading: boolean
  syncing: boolean
  add: (productId: string, configuration: Configuration, quantity: number, pendingPreview?: PendingPreview) => Promise<void>
  update: (id: string, configuration: Configuration, quantity: number) => Promise<void>
  remove: (id: string) => Promise<void>
  reload: () => Promise<void>
}

const CartContext = createContext<CartContextValue | null>(null)
const LOCAL_KEY = 'nm.cart.v1'

function readLocal(): CartLine[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    return raw ? (JSON.parse(raw) as CartLine[]) : []
  } catch {
    return []
  }
}
function writeLocal(lines: CartLine[]) {
  try {
    if (lines.length) localStorage.setItem(LOCAL_KEY, JSON.stringify(lines))
    else localStorage.removeItem(LOCAL_KEY)
  } catch {
    /* archiviazione non disponibile: il carrello ospite resta in memoria */
  }
}

async function cleanupLocalBlobs(line: CartLine) {
  const keys = [
    ...Object.values(line.configuration.areas).map((a) => a.asset?.localKey),
    line.pendingPreview?.front,
    line.pendingPreview?.back,
  ].filter((k): k is string => !!k)
  await Promise.all(keys.map((k) => blobStore.del(k).catch(() => undefined)))
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const userId = user?.id ?? null
  const [lines, setLines] = useState<CartLine[]>(() => readLocal())
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const cartIdRef = useRef<string | null>(null)

  const ensureCart = useCallback(async (uidValue: string) => {
    if (cartIdRef.current) return cartIdRef.current
    const { data } = await supabase.from('carts').select('id').eq('user_id', uidValue).maybeSingle()
    if (data?.id) {
      cartIdRef.current = data.id
      return data.id as string
    }
    const { data: created, error } = await supabase.from('carts').insert({ user_id: uidValue }).select('id').single()
    if (error) {
      // Possibile creazione concorrente: rileggi
      const { data: again } = await supabase.from('carts').select('id').eq('user_id', uidValue).maybeSingle()
      if (!again?.id) throw error
      cartIdRef.current = again.id
      return again.id as string
    }
    cartIdRef.current = created.id
    return created.id as string
  }, [])

  const loadRemote = useCallback(async (uidValue: string) => {
    const cartId = await ensureCart(uidValue)
    const { data, error } = await supabase
      .from('cart_items')
      .select('id,product_id,configuration,quantity,created_at')
      .eq('cart_id', cartId)
      .order('created_at')
    if (error) throw error
    setLines(
      (data ?? []).map((r) => ({
        id: r.id,
        productId: r.product_id,
        configuration: r.configuration as Configuration,
        quantity: r.quantity,
        createdAt: r.created_at,
      })),
    )
  }, [ensureCart])

  // Login: unisce il carrello ospite a quello persistente
  useEffect(() => {
    if (authLoading) return
    cartIdRef.current = null
    if (!userId) {
      setLines(readLocal())
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const guest = readLocal()
        if (guest.length) {
          setSyncing(true)
          const cartId = await ensureCart(userId)
          // Le righe non sincronizzate restano nel browser: nessuna configurazione va persa
          const failed: typeof guest = []
          for (const line of guest) {
            try {
              const config = await uploadPendingAssets(userId, line.configuration, line.pendingPreview)
              const { error } = await supabase.from('cart_items').insert({
                cart_id: cartId, product_id: line.productId, configuration: config, quantity: line.quantity,
              })
              if (error) throw error
              await cleanupLocalBlobs(line)
            } catch (err) {
              console.error('Riga del carrello non sincronizzata', err)
              failed.push(line)
            }
          }
          writeLocal(failed)
          setSyncing(false)
        }
        if (!cancelled) await loadRemote(userId)
      } catch (e) {
        console.error('Sincronizzazione carrello non riuscita', e)
      } finally {
        if (!cancelled) {
          setLoading(false)
          setSyncing(false)
        }
      }
    })()
    return () => { cancelled = true }
  }, [userId, authLoading, ensureCart, loadRemote])

  const add = useCallback<CartContextValue['add']>(async (productId, configuration, quantity, pendingPreview) => {
    if (userId) {
      const cartId = await ensureCart(userId)
      const { error } = await supabase.from('cart_items').insert({ cart_id: cartId, product_id: productId, configuration, quantity })
      if (error) throw error
      await loadRemote(userId)
    } else {
      const next = [...readLocal(), { id: uid(), productId, configuration, quantity, pendingPreview, createdAt: new Date().toISOString() }]
      writeLocal(next)
      setLines(next)
    }
  }, [userId, ensureCart, loadRemote])

  const update = useCallback<CartContextValue['update']>(async (id, configuration, quantity) => {
    if (userId) {
      const { error } = await supabase.from('cart_items').update({ configuration, quantity }).eq('id', id)
      if (error) throw error
      setLines((ls) => ls.map((l) => (l.id === id ? { ...l, configuration, quantity } : l)))
    } else {
      const next = readLocal().map((l) => (l.id === id ? { ...l, configuration, quantity } : l))
      writeLocal(next)
      setLines(next)
    }
  }, [userId])

  const remove = useCallback(async (id: string) => {
    if (userId) {
      const { error } = await supabase.from('cart_items').delete().eq('id', id)
      if (error) throw error
      setLines((ls) => ls.filter((l) => l.id !== id))
    } else {
      const current = readLocal()
      const line = current.find((l) => l.id === id)
      if (line) await cleanupLocalBlobs(line)
      const next = current.filter((l) => l.id !== id)
      writeLocal(next)
      setLines(next)
    }
  }, [userId])

  const reload = useCallback(async () => {
    if (userId) await loadRemote(userId)
    else setLines(readLocal())
  }, [userId, loadRemote])

  const count = useMemo(() => lines.reduce((s, l) => s + configQuantity(l.configuration, l.quantity), 0), [lines])

  const value = useMemo(
    () => ({ lines, count, loading, syncing, add, update, remove, reload }),
    [lines, count, loading, syncing, add, update, remove, reload],
  )
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart deve essere usato dentro CartProvider')
  return ctx
}
