import type { CartItem } from '../store/cartStore'

const TAX_RATE = 0.08

// Pure, framework-agnostic business logic — no JSX, no store imports beyond
// the type. This is exactly the kind of function that belongs in a shared
// packages/core later, so web and desktop compute totals identically.
export function calcTotals(
  items: CartItem[],
  discountPercent = 0
): { subtotal: number; discount: number; tax: number; total: number } {
  const subtotal = items.reduce((sum, i) => sum + i.qty * i.price, 0)
  const discount = subtotal * (discountPercent / 100)
  const taxable = subtotal - discount
  const tax = taxable * TAX_RATE
  return { subtotal, discount, tax, total: taxable + tax }
}
