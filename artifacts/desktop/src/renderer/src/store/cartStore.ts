import { create } from 'zustand'

export interface CartItem {
  id: string
  sku: string
  name: string
  qty: number
  price: number
}

interface CartState {
  items: CartItem[]
  discountPercent: number
  addItem: (item: Omit<CartItem, 'qty'>) => void
  setQty: (id: string, qty: number) => void
  updateQty: (id: string, delta: number) => void
  removeItem: (id: string) => void
  setDiscountPercent: (pct: number) => void
  clear: () => void
}

// Seeded with sample data so the screen isn't empty before the real API
// is wired up. Replace with items loaded from an actual open sale.
export const useCartStore = create<CartState>((set) => ({
  items: [
    { id: '1', sku: 'AMX-500-30', name: 'Amoxicillin 500mg', qty: 1, price: 8.4 },
    { id: '4', sku: 'SAL-INH-01', name: 'Salbutamol Inhaler', qty: 2, price: 14.9 },
    { id: '6', sku: 'VITD-1000-90', name: 'Vitamin D3 1000IU', qty: 1, price: 6.75 }
  ],
  discountPercent: 0,
  addItem: (item) =>
    set((s) => {
      const existing = s.items.find((i) => i.id === item.id)
      if (existing) {
        return { items: s.items.map((i) => (i.id === item.id ? { ...i, qty: i.qty + 1 } : i)) }
      }
      return { items: [...s.items, { ...item, qty: 1 }] }
    }),
  setQty: (id, qty) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, qty } : i)) })),
  updateQty: (id, delta) =>
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i))
    })),
  removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  setDiscountPercent: (discountPercent) => set({ discountPercent: Math.max(0, Math.min(100, discountPercent)) }),
  clear: () => set({ items: [], discountPercent: 0 })
}))
