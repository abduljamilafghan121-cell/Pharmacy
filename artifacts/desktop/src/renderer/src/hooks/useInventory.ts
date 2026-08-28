import { useEffect, useMemo, useState } from 'react'
import { apiUrl, authHeaders, jsonOrThrow } from '../lib/apiClient'

export interface InventoryItem {
  id: string
  medicineId: number
  name: string
  genericName?: string | null
  sku: string
  batch: string
  expiry: string
  qty: number
  price: number
  status: 'ok' | 'low' | 'expiring'
}

// Real per-batch inventory from artifacts/api-server's
// GET /medicines/batches-inventory — one row per batch lot on the shelf,
// joined back to its medicine for the display name and SKU. This is the
// authoritative source; it replaces the previous mock rows and the
// per-medicine aggregate view that couldn't show individual batch lots.
export function useInventory(): { data: InventoryItem[] | undefined; isLoading: boolean } {
  const [data, setData] = useState<InventoryItem[]>()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    fetch(apiUrl('/medicines/batches-inventory'), { headers: authHeaders() })
      .then((res) => jsonOrThrow(res, 'Failed to load inventory'))
      .then((rows) => {
        if (!cancelled) setData(rows as InventoryItem[])
      })
      .catch(() => {
        if (!cancelled) setData([])
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { data, isLoading }
}
