import { useQuery } from "@tanstack/react-query";

function authHeaders(): HeadersInit {
  // Session auth rides on the httpOnly cookie — no Authorization header needed.
  return {};
}

function buildUrl(path: string, params: Record<string, string | undefined>) {
  const base = `${import.meta.env.BASE_URL}api/${path}`.replace(/\/+/g, "/").replace(":/", "://");
  const query = Object.entries(params).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join("&");
  return query ? `${base}?${query}` : base;
}

export interface ProfitReport {
  revenue: string;
  cost: string;
  profit: string;
  marginPct: number;
  note: string;
}

export function useGetProfitReport(from?: string, to?: string) {
  return useQuery<ProfitReport>({
    queryKey: ["reports-profit", from, to],
    queryFn: async () => {
      const res = await fetch(buildUrl("reports/profit", { from, to }), { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load profit report");
      return res.json();
    },
  });
}

export interface TopMedicineRow {
  medicineId: number;
  medicineName: string;
  totalSold: number;
  revenue: string;
}

export function useTopMedicinesRanged(from?: string, to?: string) {
  return useQuery<TopMedicineRow[]>({
    queryKey: ["reports-top-medicines-ranged", from, to],
    queryFn: async () => {
      const res = await fetch(buildUrl("reports/top-medicines", { from, to }), { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load top medicines");
      return res.json();
    },
  });
}

export interface StaffProductivityRow {
  userId: number | null;
  userName: string | null;
  totalOrders: number;
  totalRevenue: string;
  totalItems: number;
}

export function useStaffProductivity(from?: string, to?: string) {
  return useQuery<StaffProductivityRow[]>({
    queryKey: ["reports-staff-productivity", from, to],
    queryFn: async () => {
      const res = await fetch(buildUrl("reports/staff-productivity", { from, to }), { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load staff productivity");
      return res.json();
    },
  });
}

export interface ReorderSuggestion {
  medicineId: number;
  medicineName: string;
  genericName: string | null;
  currentStock: number;
  reorderLevel: number;
  sold30Days: number;
  dailyRate: number;
  suggestedReorderQty: number;
  urgency: "critical" | "high" | "medium";
}

export function useReorderSuggestions() {
  return useQuery<ReorderSuggestion[]>({
    queryKey: ["medicines-reorder-suggestions"],
    queryFn: async () => {
      const res = await fetch(buildUrl("medicines/reorder-suggestions", {}), { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load reorder suggestions");
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 min — reorder data doesn't change second-by-second
  });
}
