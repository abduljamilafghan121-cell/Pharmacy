import { useMutation, useQueryClient } from "@tanstack/react-query";

function authHeaders(): HeadersInit {
  let token: string | null = null;
  try {
    token = localStorage.getItem("pharma_token");
  } catch {
    /* sandboxed */
  }
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function useReturnOrderItem() {
  const queryClient = useQueryClient();
  return useMutation<
    { message: string; refundAmount: string; newTotal: string },
    Error,
    { orderId: number; itemId: number; quantity: number; reason: string }
  >({
    mutationFn: async ({ orderId, itemId, quantity, reason }) => {
      const url = `${import.meta.env.BASE_URL}api/orders/${orderId}/items/${itemId}/return`.replace(/\/+/g, "/").replace(":/", "://");
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ quantity, reason }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to process return");
      return body;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${variables.orderId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
  });
}
