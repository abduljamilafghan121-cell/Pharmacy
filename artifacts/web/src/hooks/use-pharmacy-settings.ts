import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface PharmacySettings {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  licenseNumber: string | null;
  logoUrl: string | null;
  taxRatePercent: string;
  updatedAt: string;
}

export type PharmacySettingsInput = Partial<
  Pick<PharmacySettings, "name" | "address" | "phone" | "email" | "licenseNumber" | "logoUrl" | "taxRatePercent">
>;

const SETTINGS_URL = `${import.meta.env.BASE_URL}api/settings`.replace(/\/+/g, "/").replace(":/", "://");
export const PHARMACY_SETTINGS_QUERY_KEY = ["pharmacy-settings"];

function authHeaders(): HeadersInit {
  let token: string | null = null;
  try {
    token = localStorage.getItem("pharma_token");
  } catch {
    /* sandboxed */
  }
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function usePharmacySettings() {
  return useQuery<PharmacySettings>({
    queryKey: PHARMACY_SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch(SETTINGS_URL, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load pharmacy settings");
      return res.json();
    },
  });
}

export function useUpdatePharmacySettings() {
  const queryClient = useQueryClient();
  return useMutation<PharmacySettings, Error, PharmacySettingsInput>({
    mutationFn: async (data) => {
      const res = await fetch(SETTINGS_URL, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to update pharmacy settings");
      }
      return res.json();
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(PHARMACY_SETTINGS_QUERY_KEY, updated);
    },
  });
}
