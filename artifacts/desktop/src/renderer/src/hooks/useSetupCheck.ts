import { useQuery } from '@tanstack/react-query'
import { apiUrl } from '../lib/apiClient'

// Ported from artifacts/web/src/hooks/use-setup-check.ts. Checks whether the
// system has any user accounts — used on app load to show the first-run
// admin setup screen instead of the login form when the DB is empty.
// No auth header: this runs before any session exists.

export interface SetupStatus {
  hasUsers: boolean
}

export function useSetupCheck() {
  return useQuery<SetupStatus>({
    queryKey: ['setup-status'],
    queryFn: async () => {
      const res = await fetch(apiUrl('setup/status'))
      if (!res.ok) throw new Error('Failed to check setup status')
      return res.json()
    },
    // Only check once per app launch — no need to re-fetch
    staleTime: Infinity,
    retry: false
  })
}
