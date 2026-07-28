import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, auditLogsTable, usersTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { getDbErrorMessage } from "../lib/api-errors";

const router: IRouter = Router();

router.get("/audit-logs", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const entityType = req.query["entityType"] as string | undefined;
    const userId = req.query["userId"] ? Number(req.query["userId"]) : undefined;
    const limit = Math.min(Math.max(Number(req.query["limit"]) || 100, 1), 500);
    const offset = Math.max(Number(req.query["offset"]) || 0, 0);

    const conditions = [];
    if (entityType) conditions.push(eq(auditLogsTable.entityType, entityType));
    if (userId) conditions.push(eq(auditLogsTable.userId, userId));

    const rows = await db
      .select({
        id: auditLogsTable.id,
        userId: auditLogsTable.userId,
        userName: usersTable.name, // resolved live — reflects current name even if changed since
        action: auditLogsTable.action,
        entityType: auditLogsTable.entityType,
        entityId: auditLogsTable.entityId,
        description: auditLogsTable.description,
        createdAt: auditLogsTable.createdAt,
      })
      .from(auditLogsTable)
      .leftJoin(usersTable, eq(auditLogsTable.userId, usersTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(auditLogsTable)
      .where(conditions.length ? and(...conditions) : undefined);

    res.json({ entries: rows, total: count });
  } catch (err) {
    res.status(500).json({ error: "Failed to load audit log.", detail: getDbErrorMessage(err) });
  }
});

export default router;
