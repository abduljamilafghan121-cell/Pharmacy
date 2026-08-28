import { useMutation } from '@tanstack/react-query'
import { apiUrl, authHeaders, jsonOrThrow } from '../lib/apiClient'

// Ported from artifacts/web/src/hooks/use-notifications.ts. The digest
// endpoint isn't in the generated api-client-react client yet, so this
// talks to the REST endpoint by hand, same pattern as useCashShifts.ts.

export interface DigestSummary {
  lowStockCount: number
  expiringCount: number
  pendingPrescriptionCount: number
}

export function useSendDigest() {
  return useMutation<{ message: string; summary: DigestSummary }, Error, void>({
    mutationFn: async () => {
      const res = await fetch(apiUrl('notifications/send-digest'), {
        method: 'POST',
        headers: authHeaders()
      })
      return jsonOrThrow(res, 'Failed to send digest')
    }
  })
}
