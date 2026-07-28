import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface MedicineBatch {
  id: number;
  medicineId: number;
  batchNumber: string | null;
  expiryDate: string | null;
  quantity: number;
  costPrice: string | null;
  supplierId: number | null;
  purchaseOrderId: number | null;
  receivedAt: string;
  writeOffReason: string | null;
  writeOffAt: string | null;
  writeOffBy: number | null;
  createdAt: string;
}

function authHeaders(): HeadersInit {
  let token: string | null = null;
  try {
    token = localStorage.getItem("pharma_token");
  } catch {
    /* sandboxed */
  }
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function useMedicineBatches(medicineId: number | undefined) {
  const url = `${import.meta.env.BASE_URL}api/medicines/${medicineId}/batches`.replace(/\/+/g, "/").replace(":/", "://");
  return useQuery<MedicineBatch[]>({
    queryKey: ["medicine-batches", medicineId],
    queryFn: async () => {
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load batches");
      return res.json();
    },
    enabled: !!medicineId,
  });
}

export function useWriteOffBatch() {
  const queryClient = useQueryClient();
  return useMutation<{ message: string; quantityWrittenOff: number }, Error, { medicineId: number; batchId: number; reason: string }>({
    mutationFn: async ({ medicineId, batchId, reason }) => {
      const url = `${import.meta.env.BASE_URL}api/medicines/${medicineId}/batches/${batchId}/write-off`.replace(/\/+/g, "/").replace(":/", "://");
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ reason }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to write off batch");
      return body;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["medicine-batches", variables.medicineId] });
      queryClient.invalidateQueries({ queryKey: [`/api/medicines/${variables.medicineId}`] });
    },
  });
}
