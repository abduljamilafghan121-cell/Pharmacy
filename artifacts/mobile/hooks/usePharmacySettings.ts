import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';

export interface PharmacySettings {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  licenseNumber: string | null;
  logoUrl: string | null;
  taxRatePercent: string;
  currencySymbol: string;
  currencyPosition: 'prefix' | 'suffix';
  updatedAt: string;
}

export type PharmacySettingsInput = Partial<
  Pick<PharmacySettings, 'name' | 'address' | 'phone' | 'email' | 'licenseNumber' | 'logoUrl' | 'taxRatePercent' | 'currencySymbol' | 'currencyPosition'>
>;

export const PHARMACY_SETTINGS_QUERY_KEY = ['pharmacy-settings'];

// Public endpoint — no auth required, matches artifacts/web/src/hooks/use-pharmacy-settings.ts.
export function usePharmacySettings() {
  return useQuery<PharmacySettings>({
    queryKey: PHARMACY_SETTINGS_QUERY_KEY,
    queryFn: () => customFetch<PharmacySettings>('/api/settings', { method: 'GET' }),
  });
}

export function useUpdatePharmacySettings() {
  const queryClient = useQueryClient();
  return useMutation<PharmacySettings, Error, PharmacySettingsInput>({
    mutationFn: (data) =>
      customFetch<PharmacySettings>('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(PHARMACY_SETTINGS_QUERY_KEY, updated);
    },
  });
}
