import { Router, type IRouter } from "express";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import { db, cashShiftsTable, paymentsTable, usersTable } from "@workspace/db";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { getDbErrorMessage } from "../lib/api-errors";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

const SHIFT_SELECT = {
  id: cashShiftsTable.id,
  openedBy: cashShiftsTable.openedBy,
  openedByName: usersTable.name,
  openingFloat: cashShiftsTable.openingFloat,
  openedAt: cashShiftsTable.openedAt,
  closedBy: cashShiftsTable.closedBy,
  closingCountedCash: cashShiftsTable.closingCountedCash,
  manualCashOut: cashShiftsTable.manualCashOut,
  expectedCash: cashShiftsTable.expectedCash,
  variance: cashShiftsTable.variance,
  notes: cashShiftsTable.notes,
  closedAt: cashShiftsTable.closedAt,
  status: cashShiftsTable.status,
};

// Single shared register assumption (one open shift at a time) — matches
// how a small single-counter pharmacy actually operates. Multi-register
// support would need a register/terminal id on this table as a follow-up.
router.get("/cash-shifts/current", requireAuth, requireRole("admin", "pharmacist", "cashier"), async (_req, res): Promise<void> => {
  try {
    const [shift] = await db
      .select(SHIFT_SELECT)
      .from(cashShiftsTable)
      .leftJoin(usersTable, eq(cashShiftsTable.openedBy, usersTable.id))
      .where(eq(cashShiftsTable.status, "open"));
    res.json(shift ?? null);
  } catch (err) {
    res.status(500).json({ error: "Failed to load current shift.", detail: getDbErrorMessage(err) });
  }
});

router.get("/cash-shifts", requireAuth, requireRole("admin", "pharmacist", "cashier", "viewer"), async (req, res): Promise<void> => {
  try {
    const limit = Math.min(Math.max(Number(req.query["limit"]) || 50, 1), 200);
    const rows = await db
      .select(SHIFT_SELECT)
      .from(cashShiftsTable)
      .leftJoin(usersTable, eq(cashShiftsTable.openedBy, usersTable.id))
      .orderBy(desc(cashShiftsTable.openedAt))
      .limit(limit);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to load shift history.", detail: getDbErrorMessage(err) });
  }
});

const OpenShiftBody = z.object({ openingFloat: z.number().min(0) });

router.post("/cash-shifts/open", requireAuth, requireRole("admin", "pharmacist", "cashier"), async (req, res): Promise<void> => {
  const parsed = OpenShiftBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const [existing] = await db
      .select({ id: cashShiftsTable.id, openedByName: usersTable.name, openedAt: cashShiftsTable.openedAt })
      .from(cashShiftsTable)
      .leftJoin(usersTable, eq(cashShiftsTable.openedBy, usersTable.id))
      .where(eq(cashShiftsTable.status, "open"));
    if (existing) {
      res.status(409).json({ error: `A shift is already open (started by ${existing.openedByName ?? "someone"} at ${new Date(existing.openedAt).toLocaleString()}). Close it before opening a new one.` });
      return;
    }

    const [shift] = await db.insert(cashShiftsTable).values({
      openedBy: req.auth!.userId,
      openingFloat: parsed.data.openingFloat.toFixed(2),
    }).returning();

    res.status(201).json(shift);
    logAudit(req.auth!.userId, "cash_shift.open", "cash_shift", shift.id, `Opened the register with a float of ${parsed.data.openingFloat.toFixed(2)}.`);
  } catch (err) {
    res.status(500).json({ error: "Failed to open shift.", detail: getDbErrorMessage(err) });
  }
});

const CloseShiftBody = z.object({
  closingCountedCash: z.number().min(0),
  manualCashOut: z.number().min(0).optional(),
  notes: z.string().optional(),
});

router.post("/cash-shifts/:id/close", requireAuth, requireRole("admin", "pharmacist", "cashier"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id." }); return; }
  const parsed = CloseShiftBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const [shift] = await db.select().from(cashShiftsTable).where(eq(cashShiftsTable.id, id));
    if (!shift) { res.status(404).json({ error: "Shift not found." }); return; }
    if (shift.status === "closed") { res.status(409).json({ error: "This shift is already closed." }); return; }

    // Expected cash = opening float + completed cash sales recorded during
    // the shift window, minus any manual cash-out (e.g. cash refunds given
    // during the shift, entered by whoever counts the drawer — refund
    // events aren't separately timestamped as their own cash ledger entry
    // yet, so this stays a manual figure rather than an auto-computed one).
    const [cashSalesRow] = await db
      .select({ total: sql<string>`COALESCE(SUM(${paymentsTable.amount}), 0)::text` })
      .from(paymentsTable)
      .where(and(
        eq(paymentsTable.method, "cash"),
        eq(paymentsTable.status, "completed"),
        gte(paymentsTable.createdAt, shift.openedAt),
      ));

    const cashSalesTotal = parseFloat(cashSalesRow?.total ?? "0");
    const manualCashOut = parsed.data.manualCashOut ?? 0;
    const expectedCash = parseFloat(shift.openingFloat) + cashSalesTotal - manualCashOut;
    const variance = parsed.data.closingCountedCash - expectedCash;

    const [updated] = await db.update(cashShiftsTable).set({
      closedBy: req.auth!.userId,
      closingCountedCash: parsed.data.closingCountedCash.toFixed(2),
      manualCashOut: manualCashOut.toFixed(2),
      expectedCash: expectedCash.toFixed(2),
      variance: variance.toFixed(2),
      notes: parsed.data.notes ?? null,
      closedAt: new Date(),
      status: "closed",
    }).where(eq(cashShiftsTable.id, id)).returning();

    res.json(updated);
    const varianceLabel = Math.abs(variance) < 0.01 ? "balanced" : variance > 0 ? `${variance.toFixed(2)} over` : `${Math.abs(variance).toFixed(2)} short`;
    logAudit(req.auth!.userId, "cash_shift.close", "cash_shift", id,
      `Closed the register — counted ${parsed.data.closingCountedCash.toFixed(2)}, expected ${expectedCash.toFixed(2)} (${varianceLabel}).`);
  } catch (err) {
    res.status(500).json({ error: "Failed to close shift.", detail: getDbErrorMessage(err) });
  }
});

export default router;
