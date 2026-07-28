import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

const JWT_SECRET = process.env["JWT_SECRET"] ?? "pharma-dev-secret-change-in-prod";

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
  const header = req.headers["authorization"];
  if (!header || !header.startsWith("Bearer ")) {
    // Log received headers to aid debugging (mask token value for security)
    const allHeaders = Object.keys(req.headers).join(", ");
    console.warn(`[requireAuth] 401 on ${req.method} ${req.url} — headers present: ${allHeaders}`);
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }
  const token = header.slice(7);
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
