import { useMutation } from "@tanstack/react-query";

function authHeaders(): HeadersInit {
  // Session auth rides on the httpOnly cookie — no Authorization header needed.
  return {};
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
