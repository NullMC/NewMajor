import { supabase } from '@/lib/supabase'
import type { AddressSnapshot, Order, OrderItem, OrderStatus, OrderStatusHistory, PaymentMethod } from '@/types/db'

export const ORDER_DETAIL_SELECT =
  '*,order_statuses(*),order_items(*,order_item_customizations(*),order_item_roster(*)),' +
  'order_status_history(*,order_statuses(label,progress,is_cancelled))'

export interface OrderDetail extends Order {
  order_statuses: OrderStatus
  order_items: OrderItem[]
  order_status_history: OrderStatusHistory[]
}

export function normalizeOrder(o: OrderDetail): OrderDetail {
  return {
    ...o,
    order_items: (o.order_items ?? []).map((i) => ({
      ...i,
      order_item_roster: [...(i.order_item_roster ?? [])].sort((a, b) => a.position - b.position),
    })),
    order_status_history: [...(o.order_status_history ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)),
  }
}

export async function listStatuses(): Promise<OrderStatus[]> {
  const { data, error } = await supabase.from('order_statuses').select('*').order('sort_order')
  if (error) throw error
  return data as OrderStatus[]
}

export async function listMyOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*,order_statuses(*)')
    .neq('kind', 'test')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Order[]
}

export async function getOrder(id: string): Promise<OrderDetail | null> {
  const { data, error } = await supabase.from('orders').select(ORDER_DETAIL_SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? normalizeOrder(data as unknown as OrderDetail) : null
}

export async function requestOrderUpdate(orderId: string, message: string) {
  const { error } = await supabase.rpc('request_order_update', { p_order: orderId, p_message: message || null })
  if (error) throw error
}

export async function placeOrder(input: {
  paymentMethod: PaymentMethod
  shipping: AddressSnapshot
  billing: AddressSnapshot | null
  customer: { name: string; email: string; phone: string }
  notes: string
}): Promise<{ order_id: string; reference: string }> {
  const { data, error } = await supabase.rpc('place_order', {
    p_payment_method: input.paymentMethod,
    p_shipping_address: input.shipping,
    p_billing_address: input.billing,
    p_customer: input.customer,
    p_notes: input.notes || null,
  })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as { order_id: string; reference: string }
  return row
}
