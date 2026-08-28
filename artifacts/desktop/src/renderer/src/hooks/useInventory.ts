import { useMemo } from 'react'
import { useListMedicines, useGetLowStockMedicines, useGetExpiringMedicines } from '@workspace/api-client-react'
import type { Medicine } from '@workspace/api-client-react'

// api.schemas.ts (generated from openapi.yaml) lags the real API response —
// artifacts/api-server/src/routes/medicines.ts's MEDICINE_SELECT actually
// returns `barcode` on every /medicines* endpoint, but the generated
// `Medicine` type omits it. Extend locally rather than trusting the stale
// generated type; see docx/CLAUDE notes in that route file for context.
type MedicineRow = Medicine & { barcode?: string | null }

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

function toItem(m: MedicineRow, status: InventoryItem['status']): InventoryItem {
  return {
    id: String(m.id),
    name: m.name,
    sku: m.barcode ?? '—',
    batch: m.batchNumber ?? '—',
    expiry: m.expiryDate ?? '—',
    qty: m.quantity,
    price: parseFloat(m.price),
    status
  }
}

// Real inventory, built from artifacts/api-server's /medicines, /medicines/low-stock,
// and /medicines/expiring endpoints. Previously this hooked a hand-rolled
// fetch to a GET /inventory route that doesn't exist anywhere in
// artifacts/api-server/src/routes — every call 404'd and silently fell back
// to 7 hardcoded mock rows (lib/mockData.ts), so both this screen and
// Dashboard were showing fake stock data indefinitely, never real data.
export function useInventory(): { data: InventoryItem[] | undefined; isLoading: boolean } {
  const list = useListMedicines()
  const lowStock = useGetLowStockMedicines()
  const expiring = useGetExpiringMedicines()

  const data = useMemo(() => {
    if (!list.data) return undefined
    const lowIds = new Set((lowStock.data ?? []).map((m) => m.id))
    const expiringIds = new Set((expiring.data ?? []).map((m) => m.id))
    return (list.data as MedicineRow[]).map((m) => {
      // A medicine can be both low-stock and expiring; low-stock wins since
      // it's the more operationally urgent flag (can't dispense at all vs.
      // can dispense but should rotate out soon).
      const status: InventoryItem['status'] = lowIds.has(m.id)
        ? 'low'
        : expiringIds.has(m.id)
          ? 'expiring'
          : 'ok'
      return toItem(m, status)
    })
  }, [list.data, lowStock.data, expiring.data])

  return {
    data,
    isLoading: list.isLoading || lowStock.isLoading || expiring.isLoading
  }
}
