const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

export interface InventoryItem {
  id: string
  name: string
  sku: string
  batch: string
  expiry: string
  qty: number
  price: number
  status: 'ok' | 'low' | 'expiring'
}

// This is the thin edge that talks to artifacts/api-server. Once real
// endpoints exist, only this file needs to change — no component or
// store above it knows or cares that it used to be mock data.
export const api = {
  getInventory: () => request<InventoryItem[]>('/inventory'),
  createSale: (payload: { items: { id: string; qty: number }[]; paymentMethod: string }) =>
    request<{ id: string; total: number }>('/sales', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
}
