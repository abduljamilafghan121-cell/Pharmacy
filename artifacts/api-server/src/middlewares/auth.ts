import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { readAuthCookie } from "../lib/auth-cookies";

// No hardcoded fallback: if JWT_SECRET isn't set, anyone who reads the source
// could forge an admin token. Fail fast at boot instead (also enforced in
// src/index.ts alongside PORT).
function getJwtSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required but was not provided.");
  }
  return secret;
}
const JWT_SECRET = getJwtSecret();

export interface AuthPayload {
  userId: number;
  role: "admin" | "pharmacist" | "cashier" | "viewer";
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Accept a bearer token first (desktop safeStorage / mobile secure store),
  // then fall back to the httpOnly session cookie used by the web SPA.
  const header = req.headers["authorization"];
  const token = header && header.startsWith("Bearer ")
    ? header.slice(7)
    : readAuthCookie(req);
  if (!token) {
    // Log received header names to aid debugging (values are never logged).
    const allHeaders = Object.keys(req.headers).join(", ");
    logger.warn({ method: req.method, url: req.url }, "[requireAuth] 401 — headers present: " + allHeaders);
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;

    // A JWT can stay valid for up to 7 days — without this check, deactivating
    // a staff account wouldn't take effect until their token happened to
    // expire. This is a single indexed lookup by primary key, so the cost is
    // small relative to the correctness it buys.
    const [user] = await db.select({ isActive: usersTable.isActive }).from(usersTable).where(eq(usersTable.id, decoded.userId));
    if (!user || !user.isActive) {
      res.status(401).json({ error: "This account is no longer active." });
      return;
    }

    req.auth = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles: Array<"admin" | "pharmacist" | "cashier" | "viewer">) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(req.auth.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
