import { setBaseUrl, setAuthTokenGetter } from '@workspace/api-client-react'

// This is the desktop app's only connection point to the shared client.
// Same generated hooks (useListMedicines, useCreateOrder, useGetMe, ...)
// as artifacts/web — the desktop app never talks to the API directly.
//
// IMPORTANT: the generated client's paths already include "/api" (e.g.
// getGetMeUrl() -> "/api/auth/me"), so VITE_API_URL must be the bare
// origin — no trailing /api — or every request would end up as
// ".../api/api/...".

const TOKEN_KEY = 'pharma_token'

let tokenCache: string | null = (() => {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
})()

export function getToken(): string | null {
  return tokenCache
}

export function setToken(token: string | null): void {
  tokenCache = token
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // sandboxed / storage unavailable — token still lives in memory for this session
  }
}

function resolveOrigin(): string {
  const configured = import.meta.env.VITE_API_URL
  if (!configured) {
    console.error(
      'VITE_API_URL is not set. Add it to .env — see .env.example. ' +
        'Falling back to http://localhost:4000 for local dev.'
    )
    return 'http://localhost:4000'
  }
  // Be forgiving if someone pastes the URL with a trailing /api anyway.
  return configured.replace(/\/+$/, '').replace(/\/api$/, '')
}

// Called once, before the app renders (see main.tsx).
export function initApiClient(): void {
  setBaseUrl(resolveOrigin())
  setAuthTokenGetter(() => tokenCache)
}

// Small helper for the two endpoints that aren't in the generated client
// yet (cash shifts, pharmacy settings) — mirrors artifacts/web's
// use-tier5.ts / use-pharmacy-settings.ts, but against an absolute URL
// since there's no same-origin server to resolve a relative /api path
// against in Electron.
export function apiUrl(path: string): string {
  return `${resolveOrigin()}/api/${path}`.replace(/([^:]\/)\/+/g, '$1')
}

export function authHeaders(): HeadersInit {
  return tokenCache ? { Authorization: `Bearer ${tokenCache}` } : {}
}

export async function jsonOrThrow(res: Response, fallback: string): Promise<any> {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? fallback)
  return body
}

// Best-effort logout notification to the API so a "logout" audit entry can
// be recorded. Fire-and-forget: the local session is cleared regardless of
// whether the request succeeds (e.g. token already expired).
export function notifyLogout(): void {
  try {
    void fetch(`${apiUrl('auth/logout')}`, {
      method: 'POST',
      headers: { ...authHeaders() },
      keepalive: true
    }).catch(() => {})
  } catch {
    // ignore — logout should never fail because of audit reporting
  }
}
