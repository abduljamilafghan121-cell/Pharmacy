import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, medicinesTable, prescriptionsTable, usersTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { sendDigestEmail } from "../lib/mailer";
import { getDbErrorMessage } from "../lib/api-errors";

const router: IRouter = Router();

// Manually triggered for now (no email provider or cron scheduler is wired
// up yet — see lib/mailer.ts). Once you add a cron service (e.g. a daily
// Vercel Cron hitting this endpoint with an admin-scoped token), this same
// route works unchanged for automatic daily digests.
router.post("/notifications/send-digest", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const [inventoryRow] = await db
      .select({
        lowStockCount: sql<number>`COUNT(*) FILTER (WHERE ${medicinesTable.quantity} <= ${medicinesTable.reorderLevel})::int`,
        expiringCount: sql<number>`COUNT(*) FILTER (WHERE ${medicinesTable.expiryDate} IS NOT NULL AND ${medicinesTable.expiryDate} <= NOW() + INTERVAL '30 days' AND ${medicinesTable.expiryDate} >= NOW())::int`,
      })
      .from(medicinesTable);

    const [{ pendingCount }] = await db
      .select({ pendingCount: sql<number>`COUNT(*) FILTER (WHERE ${prescriptionsTable.status} = 'pending')::int` })
      .from(prescriptionsTable);

    const [admin] = await db.select({ email: usersTable.email }).from(usersTable).where(sql`${usersTable.id} = ${req.auth!.userId}`);
    const recipient = admin?.email;
    if (!recipient) {
      res.status(400).json({ error: "Could not determine a recipient email." });
      return;
    }

    const summary = {
      lowStockCount: inventoryRow?.lowStockCount ?? 0,
      expiringCount: inventoryRow?.expiringCount ?? 0,
      pendingPrescriptionCount: pendingCount ?? 0,
    };
    await sendDigestEmail(recipient, summary);

    res.json({ message: "Digest sent (see server logs — no email provider is connected yet).", summary });
  } catch (err) {
    res.status(500).json({ error: "Failed to send digest.", detail: getDbErrorMessage(err) });
  }
});

export default router;
