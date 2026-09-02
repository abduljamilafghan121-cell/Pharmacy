import { useQuery } from "@tanstack/react-query";

export interface AuditLogEntry {
  id: number;
  userId: number | null;
  userName: string | null;
  action: string;
  entityType: string;
  entityId: number | null;
  description: string;
  createdAt: string;
}

function authHeaders(): HeadersInit {
  // Session auth rides on the httpOnly cookie — no Authorization header needed.
  return {};
}

export function useAuditLog(entityType?: string) {
  const base = `${import.meta.env.BASE_URL}api/audit-logs`.replace(/\/+/g, "/").replace(":/", "://");
  const url = entityType ? `${base}?entityType=${encodeURIComponent(entityType)}` : base;
  return useQuery<{ entries: AuditLogEntry[]; total: number }>({
    queryKey: ["audit-logs", entityType],
    queryFn: async () => {
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load audit log");
      return res.json();
    },
  });
}
