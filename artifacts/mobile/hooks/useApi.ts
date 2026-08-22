import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { customFetch } from '@workspace/api-client-react';

/** Thin wrapper for GET endpoints that don't have a generated hook yet
 * (audit logs, cash shifts, insurance claims, pre-authorizations,
 * stocktakes, supplier returns, drug interactions, controlled-substance
 * logs — see artifacts/api-server/src/routes for their real shapes).
 * Reuses customFetch so base URL + auth headers stay consistent with the
 * rest of the app. */
export function useApiQuery<T>(
  queryKey: (string | number | undefined | null)[],
  path: string,
  options?: { enabled?: boolean },
) {
  return useQuery<T>({
    queryKey,
    queryFn: () => customFetch<T>(path, { method: 'GET' }),
    enabled: options?.enabled ?? true,
  });
}

/** Thin wrapper for POST/PATCH endpoints not yet in the generated client.
 * Invalidates the given query keys on success so the list screen refreshes. */
export function useApiMutation<TResponse, TVariables>(
  path: string | ((vars: TVariables) => string),
  invalidateKeys: (string | number)[][] = [],
  method: 'POST' | 'PATCH' = 'POST',
) {
  const queryClient = useQueryClient();
  return useMutation<TResponse, Error, TVariables>({
    mutationFn: (vars) =>
      customFetch<TResponse>(typeof path === 'function' ? path(vars) : path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vars),
      }),
    onSuccess: () => {
      invalidateKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    },
  });
}
