import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getListPrescriptionsQueryKey } from "@workspace/api-client-react";

const BASE_URL = `${import.meta.env.BASE_URL}api/prescriptions`.replace(/\/+/g, "/").replace(":/", "://");

function authHeaders(): HeadersInit {
  let token: string | null = null;
  try {
    token = localStorage.getItem("pharma_token");
  } catch {
    /* sandboxed */
  }
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function useAttachPrescriptionFile() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, { id: number; attachmentUrl: string }>({
    mutationFn: async ({ id, attachmentUrl }) => {
      const res = await fetch(`${BASE_URL}/${id}/attachment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ attachmentUrl }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to attach file");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListPrescriptionsQueryKey() });
    },
  });
}
