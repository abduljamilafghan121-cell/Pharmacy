// Sample SKU catalog for barcode-scan / quick-add lookups on the Checkout
// screen. Swap findBySkuOrName's source for a real GET /catalog?query=
// call to artifacts/api-server once that endpoint exists.
export interface CatalogItem {
  id: string
  sku: string
  name: string
  price: number
}

export const catalog: CatalogItem[] = [
  { id: '1', sku: 'AMX-500-30', name: 'Amoxicillin 500mg', price: 8.4 },
  { id: '2', sku: 'MET-850-60', name: 'Metformin 850mg', price: 5.2 },
  { id: '3', sku: 'ATV-020-30', name: 'Atorvastatin 20mg', price: 11.75 },
  { id: '4', sku: 'SAL-INH-01', name: 'Salbutamol Inhaler', price: 14.9 },
  { id: '5', sku: 'LOS-050-30', name: 'Losartan 50mg', price: 6.6 },
  { id: '6', sku: 'VITD-1000-90', name: 'Vitamin D3 1000IU', price: 6.75 },
  { id: '7', sku: 'PARA-500-20', name: 'Paracetamol 500mg', price: 3.1 }
]

export function findBySkuOrName(query: string): CatalogItem | undefined {
  const q = query.trim().toLowerCase()
  if (!q) return undefined
  return (
    catalog.find((c) => c.sku.toLowerCase() === q) ??
    catalog.find((c) => c.name.toLowerCase().includes(q))
  )
}
