import {
  setBaseUrl,
  setAuthTokenGetter,
  setWriteBlocker,
  OfflineError
} from '@workspace/api-client-react'
import { useUiStore } from '../store/uiStore'

// This is the desktop app's only connection point to the shared client.
// Same generated hooks (useListMedicines, useCreateOrder, useGetMe, ...)
// as artifacts/web — the desktop app never talks to the API directly.
//
// IMPORTANT: the generated client's paths already include "/api" (e.g.
// getGetMeUrl() -> "/api/auth/me"), so VITE_API_URL must be the bare
// origin — no trailing /api — or every request would end up as
// ".../api/api/...".

const TOKEN_KEY = 'pharma_token'

let tokenCache: string | null = null

interface TokenStorage {
  load: () => Promise<string | null>
  save: (token: string | null) => Promise<void>
}

// Desktop persists the session token through the preload bridge into the
// main process, which stores it with Electron safeStorage (OS keychain /
// DPAPI on Windows). localStorage is deliberately not used for the token —
// any injected script could trivially read it there. The localStorage
// fallback below only exists for running the renderer outside Electron (no
// window.api bridge) and the one-time migration of legacy tokens.
function tokenStorage(): TokenStorage | undefined {
  const bridge = window.api?.token
  if (bridge) return { load: () => bridge.load(), save: (t) => bridge.save(t) }
  return undefined
}

async function loadInitialToken(): Promise<string | null> {
  const storage = tokenStorage()
  if (storage) {
    const stored = await storage.load()
    if (stored) return stored
    // One-time migration: older builds kept the token in localStorage, so
    // move it into the secure store on first run and drop the plaintext copy.
    try {
      const legacy = localStorage.getItem(TOKEN_KEY)
      if (legacy) {
        localStorage.removeItem(TOKEN_KEY)
        void storage.save(legacy)
        return legacy
      }
    } catch {
      // ignore — secure store is the source of truth from here on
    }
    return null
  }
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function getToken(): string | null {
  return tokenCache
}

export function setToken(token: string | null): void {
  tokenCache = token
  const storage = tokenStorage()
  if (storage) {
    void storage.save(token)
    try {
      if (!token) localStorage.removeItem(TOKEN_KEY)
    } catch {
      // ignore — secure store is authoritative
    }
  } else {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token)
      else localStorage.removeItem(TOKEN_KEY)
    } catch {
      // storage unavailable — token still lives in memory for this session
    }
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

// Called once, before the app renders (see main.tsx). Async because the
// saved token has to be read back from the OS secure store via IPC before
// the first authenticated request.
export async function initApiClient(): Promise<void> {
  setBaseUrl(resolveOrigin())
  tokenCache = await loadInitialToken()
  setAuthTokenGetter(() => tokenCache)
  // Block all mutating API calls while the app is offline, so users can't
  // create/change data (sales, edits, deletes) against an unreachable server.
  setWriteBlocker(() => useUiStore.getState().offline)
  guardRawWrites()
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// The generated client already fails-fast via setWriteBlocker, but a handful
// of endpoints (cash shifts, settings, allergies, stocktakes, ...) fetch the
// API directly and bypass that guard. A narrow fetch wrapper here catches every
// raw write for real: blocked only when offline, against the API origin, for
// write methods. Reads and everything else pass straight through untouched.
function guardRawWrites(): void {
  const nativeFetch = window.fetch.bind(window)
  const origin = resolveOrigin()
  const canReject = (input: RequestInfo | URL, init?: RequestInit): boolean => {
    const method =
      (input instanceof Request ? input.method : init?.method ?? 'GET').toUpperCase()
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    return (
      useUiStore.getState().offline &&
      WRITE_METHODS.has(method) &&
      (raw.startsWith(origin) || raw.includes('/api/'))
    )
  }
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (canReject(input, init)) throw new OfflineError()
    return nativeFetch(input, init)
  }) as typeof fetch
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
