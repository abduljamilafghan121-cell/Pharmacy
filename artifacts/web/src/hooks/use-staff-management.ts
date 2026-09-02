import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getListUsersQueryKey } from "@workspace/api-client-react";

const BASE_URL = `${import.meta.env.BASE_URL}api/users`.replace(/\/+/g, "/").replace(":/", "://");

function authHeaders(): HeadersInit {
  // Session auth rides on the httpOnly cookie — no Authorization header needed.
  return {};
}

async function parseErrorOrThrow(res: Response, fallback: string) {
  if (res.ok) return res.json();
  const body = await res.json().catch(() => ({}));
  throw new Error(body.error ?? fallback);
}

export interface UpdateStaffInput {
  name?: string;
  phone?: string | null;
  role?: "admin" | "pharmacist";
  isActive?: boolean;
}

export function useUpdateStaffUser() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, { id: number; data: UpdateStaffInput }>({
    mutationFn: async ({ id, data }) => {
      const res = await fetch(`${BASE_URL}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(data),
      });
      return parseErrorOrThrow(res, "Failed to update staff account");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
    },
  });
}

export function useResetStaffPassword() {
  return useMutation<unknown, Error, { id: number; newPassword: string }>({
    mutationFn: async ({ id, newPassword }) => {
      const res = await fetch(`${BASE_URL}/${id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ newPassword }),
      });
      return parseErrorOrThrow(res, "Failed to reset password");
    },
  });
}
