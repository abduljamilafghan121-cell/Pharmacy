import type { InventoryItem } from './api'

// Prices here match lib/catalog.ts for every overlapping SKU. Inventory and
// Checkout should really read from one shared product table — see note in
// api.ts. Until that merge happens, keep these two files in sync by hand.
export const mockInventory: InventoryItem[] = [
  { id: '1', name: 'Amoxicillin 500mg', sku: 'AMX-500-30', batch: 'B2291', expiry: '2026-11-02', qty: 214, price: 8.4, status: 'ok' },
  { id: '2', name: 'Metformin 850mg', sku: 'MET-850-60', batch: 'B1187', expiry: '2026-09-14', qty: 18, price: 5.2, status: 'low' },
  { id: '3', name: 'Atorvastatin 20mg', sku: 'ATV-020-30', batch: 'B0542', expiry: '2026-08-30', qty: 62, price: 11.75, status: 'expiring' },
  { id: '4', name: 'Salbutamol Inhaler', sku: 'SAL-INH-01', batch: 'B3390', expiry: '2027-02-18', qty: 41, price: 14.9, status: 'ok' },
  { id: '5', name: 'Losartan 50mg', sku: 'LOS-050-30', batch: 'B2887', expiry: '2026-10-05', qty: 9, price: 6.6, status: 'low' },
  { id: '6', name: 'Vitamin D3 1000IU', sku: 'VITD-1000-90', batch: 'B4410', expiry: '2027-06-01', qty: 88, price: 6.75, status: 'ok' },
  { id: '7', name: 'Paracetamol 500mg', sku: 'PARA-500-20', batch: 'B5023', expiry: '2027-01-15', qty: 133, price: 3.1, status: 'ok' }
]
