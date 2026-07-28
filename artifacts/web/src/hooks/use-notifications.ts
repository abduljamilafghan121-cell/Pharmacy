import { useMutation } from "@tanstack/react-query";

function authHeaders(): HeadersInit {
  let token: string | null = null;
  try {
    token = localStorage.getItem("pharma_token");
  } catch {
    /* sandboxed */
  }
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function useSendDigest() {
  return useMutation<{ message: string; summary: any }, Error, void>({
    mutationFn: async () => {
      const url = `${import.meta.env.BASE_URL}api/notifications/send-digest`.replace(/\/+/g, "/").replace(":/", "://");
      const res = await fetch(url, { method: "POST", headers: authHeaders() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to send digest");
      return body;
    },
  });
}
