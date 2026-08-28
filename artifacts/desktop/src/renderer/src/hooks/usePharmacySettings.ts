import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiUrl, authHeaders } from '../lib/apiClient'

// Same shape as artifacts/web's PharmacySettings — kept in sync manually
// until this moves into a shared lib/ package (it isn't in the generated
// api-client-react client yet).
export interface PharmacySettings {
  id: number
  name: string
  address: string | null
  phone: string | null
  email: string | null
  licenseNumber: string | null
  logoUrl: string | null
  taxRatePercent: string
  currencySymbol: string
  currencyPosition: 'prefix' | 'suffix'
  updatedAt: string
}

export type PharmacySettingsInput = Partial<
  Pick<
    PharmacySettings,
    | 'name'
    | 'address'
    | 'phone'
    | 'email'
    | 'licenseNumber'
    | 'logoUrl'
    | 'taxRatePercent'
    | 'currencySymbol'
    | 'currencyPosition'
  >
>

export const PHARMACY_SETTINGS_QUERY_KEY = ['pharmacy-settings']

export function usePharmacySettings() {
  return useQuery<PharmacySettings>({
    queryKey: PHARMACY_SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch(apiUrl('settings'), { headers: authHeaders() })
      if (!res.ok) throw new Error('Failed to load pharmacy settings')
      return res.json()
    }
  })
}

export function useUpdatePharmacySettings() {
  const queryClient = useQueryClient()
  return useMutation<PharmacySettings, Error, PharmacySettingsInput>({
    mutationFn: async (data) => {
      const res = await fetch(apiUrl('settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(data)
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Failed to update pharmacy settings')
      return body
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(PHARMACY_SETTINGS_QUERY_KEY, updated)
    }
  })
}

export function formatCurrency(amount: number, settings?: PharmacySettings): string {
  const symbol = settings?.currencySymbol ?? '$'
  const formatted = amount.toFixed(2)
  return settings?.currencyPosition === 'suffix' ? `${formatted}${symbol}` : `${symbol}${formatted}`
}
