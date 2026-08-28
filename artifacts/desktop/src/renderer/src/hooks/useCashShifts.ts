import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiUrl, authHeaders, jsonOrThrow } from '../lib/apiClient'

// Ported from artifacts/web/src/hooks/use-tier5.ts (cash-shift section).
// Not yet in the generated api-client-react client, so this talks to the
// same REST endpoints by hand, same as web does — kept identical on
// purpose so behavior matches exactly until both move into one shared
// lib/ package.

export interface CashShift {
  id: number
  openedBy: number
  openedByName: string | null
  openingFloat: string
  openedAt: string
  closedBy: number | null
  closingCountedCash: string | null
  manualCashOut: string
  expectedCash: string | null
  variance: string | null
  notes: string | null
  closedAt: string | null
  status: 'open' | 'closed'
}

export function useCurrentCashShift() {
  return useQuery<CashShift | null>({
    queryKey: ['cash-shift-current'],
    queryFn: async () => {
      const res = await fetch(apiUrl('cash-shifts/current'), { headers: authHeaders() })
      return jsonOrThrow(res, 'Failed to load current shift')
    }
  })
}

export function useCashShiftHistory() {
  return useQuery<CashShift[]>({
    queryKey: ['cash-shifts'],
    queryFn: async () => {
      const res = await fetch(apiUrl('cash-shifts'), { headers: authHeaders() })
      return jsonOrThrow(res, 'Failed to load shift history')
    }
  })
}

export function useOpenCashShift() {
  const queryClient = useQueryClient()
  return useMutation<CashShift, Error, { openingFloat: number }>({
    mutationFn: async (data) => {
      const res = await fetch(apiUrl('cash-shifts/open'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(data)
      })
      return jsonOrThrow(res, 'Failed to open shift')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-shift-current'] })
      queryClient.invalidateQueries({ queryKey: ['cash-shifts'] })
    }
  })
}

export function useCloseCashShift() {
  const queryClient = useQueryClient()
  return useMutation<
    CashShift,
    Error,
    { id: number; closingCountedCash: number; manualCashOut?: number; notes?: string }
  >({
    mutationFn: async ({ id, ...data }) => {
      const res = await fetch(apiUrl(`cash-shifts/${id}/close`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(data)
      })
      return jsonOrThrow(res, 'Failed to close shift')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-shift-current'] })
      queryClient.invalidateQueries({ queryKey: ['cash-shifts'] })
    }
  })
}
