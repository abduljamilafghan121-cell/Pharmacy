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
  try {
    const result = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(usersTable);
    const hasUsers = (result[0]?.count ?? 0) > 0;
    res.json({ hasUsers });
  } catch (err) {
    // Return hasUsers: false so the frontend shows the setup screen,
    // not a blank crash — the global error handler will also log it.
    res.status(500).json({ hasUsers: false, error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
