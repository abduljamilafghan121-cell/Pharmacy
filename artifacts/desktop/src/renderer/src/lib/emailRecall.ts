// Remembers email addresses the user has successfully signed in with, so the
// login screen can offer a "previously used accounts" suggestion dropdown —
// the desktop equivalent of a professional platform's remembered accounts.
//
// This is intentionally local to the device (Electron localStorage). It only
// ever stores emails the user already logged in with, matching the server's
// privacy posture of never exposing registered emails to unauthenticated
// clients.

const KEY = 'pharma_recall_emails'
const MAX = 8

export function getRecallEmails(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    return list.filter((e): e is string => typeof e === 'string' && e.includes('@'))
  } catch {
    return []
  }
}

export function rememberEmail(email: string): void {
  const clean = email.trim().toLowerCase()
  if (!clean || !clean.includes('@')) return
  try {
    const list = getRecallEmails().filter((e) => e !== clean)
    list.unshift(clean)
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch {
    /* storage unavailable — best-effort */
  }
}

export function clearRecallEmails(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* noop */
  }
}
