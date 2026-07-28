import { useQuery } from "@tanstack/react-query";

function authHeaders(): HeadersInit {
  let token: string | null = null;
  try {
    token = localStorage.getItem("pharma_token");
  } catch {
    /* sandboxed */
  }
  return token ? { Authorization: `Bearer ${token}` } : {};
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
