import type { Request, Response } from "express";

// httpOnly session cookie for the web SPA. The token is invisible to page
// JavaScript (no localStorage, no JS-accessible getter), so an XSS can no
// longer exfiltrate it — the browser attaches the cookie on same-origin /api
// calls automatically. Desktop (safeStorage + Authorization header) and
// mobile (Authorization header) are unaffected; requireAuth still accepts
// both, so this is backward compatible.
export const AUTH_COOKIE = "pharma_token";
// Matches signToken's expiresIn "7d" in src/middlewares/auth.ts.
export const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function secureCookie(): boolean {
  return process.env.NODE_ENV === "production";
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: secureCookie(),
    // SameSite=Lax: the cookie is sent on same-site requests (the SPA's /api
    // calls) but withheld from cross-site POSTs, which neutralizes CSRF for
    // mutating calls. Combined with the CORS allow-list, cross-origin reads
    // are blocked anyway.
    sameSite: "lax",
    // Scoped to /api so the cookie only travels with API requests.
    path: "/api",
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    path: "/api",
  });
}

// Minimal cookie parser — avoids the cookie-parser dependency. Only used to
// read the single auth cookie in requireAuth.
export function readAuthCookie(req: Request): string | null {
  const cookieHeader = req.headers["cookie"];
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    if (part.slice(0, eqIdx).trim() !== AUTH_COOKIE) continue;
    try {
      return decodeURIComponent(part.slice(eqIdx + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}