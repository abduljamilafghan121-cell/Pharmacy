import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

function authHeaders(): HeadersInit {
  // Session auth rides on the httpOnly cookie — no Authorization header needed.
  return {};
}

function apiUrl(path: string) {
  return `${import.meta.env.BASE_URL}api/${path}`.replace(/\/+/g, "/").replace(":/", "://");
}

async function jsonOrThrow(res: Response, fallback: string) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? fallback);
  return body;
}

// ── Supplier Returns ─────────────────────────────────────────────────────

export interface SupplierReturn {
  id: number;
  supplierId: number;
  supplierName: string | null;
  purchaseOrderId: number | null;
  reason: string;
  totalAmount: string;
  createdAt: string;
}

export function useListSupplierReturns() {
  return useQuery<SupplierReturn[]>({
    queryKey: ["supplier-returns"],
    queryFn: async () => {
      const res = await fetch(apiUrl("supplier-returns"), { headers: authHeaders() });
      return jsonOrThrow(res, "Failed to load supplier returns");
    },
  });
}

export function useCreateSupplierReturn() {
  const queryClient = useQueryClient();
  return useMutation<{ id: number; totalAmount: string }, Error, {
    supplierId: number; purchaseOrderId?: number; reason: string;
    items: { medicineId: number; medicineBatchId: number; quantity: number; unitCost?: number }[];
  }>({
    mutationFn: async (data) => {
      const res = await fetch(apiUrl("supplier-returns"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(data),
      });
      return jsonOrThrow(res, "Failed to process supplier return");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-returns"] });
      queryClient.invalidateQueries({ queryKey: ["medicine-batches"] });
    },
  });
}

// ── Cash Shifts ──────────────────────────────────────────────────────────

export interface CashShift {
  id: number;
  openedBy: number;
  openedByName: string | null;
  openingFloat: string;
  openedAt: string;
  closedBy: number | null;
  closingCountedCash: string | null;
  manualCashOut: string;
  expectedCash: string | null;
  variance: string | null;
  notes: string | null;
  closedAt: string | null;
  status: "open" | "closed";
}

export function useCurrentCashShift() {
  return useQuery<CashShift | null>({
    queryKey: ["cash-shift-current"],
    queryFn: async () => {
      const res = await fetch(apiUrl("cash-shifts/current"), { headers: authHeaders() });
      return jsonOrThrow(res, "Failed to load current shift");
    },
  });
}

export function useCashShiftHistory() {
  return useQuery<CashShift[]>({
    queryKey: ["cash-shifts"],
    queryFn: async () => {
      const res = await fetch(apiUrl("cash-shifts"), { headers: authHeaders() });
      return jsonOrThrow(res, "Failed to load shift history");
    },
  });
}

export function useOpenCashShift() {
  const queryClient = useQueryClient();
  return useMutation<CashShift, Error, { openingFloat: number }>({
    mutationFn: async (data) => {
      const res = await fetch(apiUrl("cash-shifts/open"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(data),
      });
      return jsonOrThrow(res, "Failed to open shift");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-shift-current"] });
      queryClient.invalidateQueries({ queryKey: ["cash-shifts"] });
    },
  });
}

export function useCloseCashShift() {
  const queryClient = useQueryClient();
  return useMutation<CashShift, Error, { id: number; closingCountedCash: number; manualCashOut?: number; notes?: string }>({
    mutationFn: async ({ id, ...data }) => {
      const res = await fetch(apiUrl(`cash-shifts/${id}/close`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(data),
      });
      return jsonOrThrow(res, "Failed to close shift");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-shift-current"] });
      queryClient.invalidateQueries({ queryKey: ["cash-shifts"] });
    },
  });
}

// ── Insurance Claims ─────────────────────────────────────────────────────

export interface InsuranceClaim {
  id: number;
  orderId: number;
  providerName: string;
  policyNumber: string | null;
  claimAmount: string;
  status: "submitted" | "approved" | "rejected" | "paid";
  submittedBy: number | null;
  submittedByName: string | null;
  submittedAt: string;
  resolvedAt: string | null;
  notes: string | null;
}

export function useListInsuranceClaims(status?: string) {
  return useQuery<InsuranceClaim[]>({
    queryKey: ["insurance-claims", status],
    queryFn: async () => {
      const url = status ? `${apiUrl("insurance-claims")}?status=${status}` : apiUrl("insurance-claims");
      const res = await fetch(url, { headers: authHeaders() });
      return jsonOrThrow(res, "Failed to load insurance claims");
    },
  });
}

export function useCreateInsuranceClaim() {
  const queryClient = useQueryClient();
  return useMutation<InsuranceClaim, Error, { orderId: number; providerName: string; policyNumber?: string; claimAmount: number; notes?: string }>({
    mutationFn: async (data) => {
      const res = await fetch(apiUrl("insurance-claims"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(data),
      });
      return jsonOrThrow(res, "Failed to submit claim");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["insurance-claims"] }),
  });
}

export function useUpdateInsuranceClaim() {
  const queryClient = useQueryClient();
  return useMutation<InsuranceClaim, Error, { id: number; status: string; notes?: string }>({
    mutationFn: async ({ id, ...data }) => {
      const res = await fetch(apiUrl(`insurance-claims/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(data),
      });
      return jsonOrThrow(res, "Failed to update claim");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["insurance-claims"] }),
  });
}

// ── Insurance Pre-Authorizations ─────────────────────────────────────────────

export interface InsurancePreAuth {
  id: number;
  patientId: number | null;
  patientName: string | null;
  medicineId: number;
  medicineName: string | null;
  prescriptionId: number | null;
  insurerName: string;
  policyNumber: string | null;
  diagnosisCode: string | null;
  requestedBy: number | null;
  requestedByName: string | null;
  status: "pending" | "approved" | "denied" | "expired";
  referenceNumber: string | null;
  notes: string | null;
  submittedAt: string;
  resolvedAt: string | null;
}

export function useListPreAuths(status?: string) {
  return useQuery<InsurancePreAuth[]>({
    queryKey: ["pre-authorizations", status],
    queryFn: async () => {
      const url = status ? `${apiUrl("pre-authorizations")}?status=${status}` : apiUrl("pre-authorizations");
      const res = await fetch(url, { headers: authHeaders() });
      return jsonOrThrow(res, "Failed to load pre-authorizations");
    },
  });
}

export function useCreatePreAuth() {
  const queryClient = useQueryClient();
  return useMutation<InsurancePreAuth, Error, {
    medicineId: number;
    patientId?: number;
    prescriptionId?: number;
    insurerName: string;
    policyNumber?: string;
    diagnosisCode?: string;
    notes?: string;
  }>({
    mutationFn: async (data) => {
      const res = await fetch(apiUrl("pre-authorizations"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(data),
      });
      return jsonOrThrow(res, "Failed to submit pre-authorization");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pre-authorizations"] }),
  });
}

export function useUpdatePreAuth() {
  const queryClient = useQueryClient();
  return useMutation<InsurancePreAuth, Error, {
    id: number;
    status?: string;
    referenceNumber?: string | null;
    notes?: string | null;
  }>({
    mutationFn: async ({ id, ...data }) => {
      const res = await fetch(apiUrl(`pre-authorizations/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(data),
      });
      return jsonOrThrow(res, "Failed to update pre-authorization");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pre-authorizations"] }),
  });
}
