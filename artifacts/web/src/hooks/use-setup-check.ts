import { useQuery } from "@tanstack/react-query";

interface SetupStatus {
  hasUsers: boolean;
}

/**
 * Checks whether the system has any user accounts.
 * Used on app load to redirect to the first-run setup screen when the DB is empty.
 */
export function useSetupCheck() {
  return useQuery<SetupStatus>({
    queryKey: ["setup-status"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/setup/status`.replace(/\/+/g, "/").replace(":/", "://"));
      if (!res.ok) throw new Error("Failed to check setup status");
      return res.json();
    },
    // Only check once per page load — no need to re-fetch
    staleTime: Infinity,
    retry: false,
  });
}
