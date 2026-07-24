import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

/**
 * Public endpoint — no auth required.
 * Returns whether the system has at least one user account.
 * Used by the frontend to show the first-run admin setup screen.
 */
router.get("/setup/status", async (_req, res): Promise<void> => {
  const result = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(usersTable);
  const hasUsers = (result[0]?.count ?? 0) > 0;
  res.json({ hasUsers });
});

export default router;
