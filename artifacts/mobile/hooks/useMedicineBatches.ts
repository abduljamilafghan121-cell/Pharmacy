import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';

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

/** All batches for one medicine, oldest-expiry first (FEFO order) — as
 * returned by the same /medicines/:id/batches endpoint the web app uses. */
export function useMedicineBatches(medicineId: number | undefined) {
  return useQuery<MedicineBatch[]>({
    queryKey: ['medicine-batches', medicineId],
    queryFn: () => customFetch<MedicineBatch[]>(`/api/medicines/${medicineId}/batches`, { method: 'GET' }),
    enabled: !!medicineId,
  });
}

/** Non-expired, non-written-off batches only — the set that's safe to
 * offer as a "top up this batch" choice when receiving a purchase order. */
export function useSellableBatches(medicineId: number | undefined) {
  const query = useMedicineBatches(medicineId);
  const today = new Date().toISOString().slice(0, 10);
  const sellable = (query.data ?? []).filter(
    (b) => !b.writeOffAt && (!b.expiryDate || b.expiryDate >= today),
  );
  return { ...query, data: sellable };
}

export function useWriteOffBatch() {
  const queryClient = useQueryClient();
  return useMutation<{ message: string; quantityWrittenOff: number }, Error, { medicineId: number; batchId: number; reason: string }>({
    mutationFn: ({ medicineId, batchId, reason }) =>
      customFetch(`/api/medicines/${medicineId}/batches/${batchId}/write-off`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['medicine-batches', variables.medicineId] });
    },
  });
}
