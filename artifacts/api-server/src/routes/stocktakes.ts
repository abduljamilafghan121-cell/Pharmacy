import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, stocktakesTable, stocktakeItemsTable, medicinesTable, usersTable } from "@workspace/db";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";
import { logAudit } from "../lib/audit";
import { getDbErrorMessage } from "../lib/api-errors";

const router: IRouter = Router();

// List all stocktakes
router.get("/stocktakes", requireAuth, async (req, res): Promise<void> => {
  try {
    const rows = await db
      .select({
        id: stocktakesTable.id,
        reference: stocktakesTable.reference,
        status: stocktakesTable.status,
        notes: stocktakesTable.notes,
        createdByName: usersTable.name,
        finalizedAt: stocktakesTable.finalizedAt,
        createdAt: stocktakesTable.createdAt,
      })
      .from(stocktakesTable)
      .leftJoin(usersTable, eq(stocktakesTable.createdBy, usersTable.id))
      .orderBy(sql`${stocktakesTable.createdAt} DESC`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to load stocktakes.", detail: getDbErrorMessage(err) });
  }
});

// Create a new stocktake — seeds items from current medicine stock
router.post("/stocktakes", requireAuth, async (req, res): Promise<void> => {
  const bodySchema = z.object({
    reference: z.string().trim().min(1).optional(),
    notes: z.string().optional(),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input." }); return; }

  try {
    const medicines = await db
      .select({ id: medicinesTable.id, name: medicinesTable.name, quantity: medicinesTable.quantity })
      .from(medicinesTable)
      .orderBy(medicinesTable.name);

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const defaultRef = `ST-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
    const reference = parsed.data.reference ?? defaultRef;

    const stocktake = await db.transaction(async (tx) => {
      const [st] = await tx.insert(stocktakesTable).values({
        reference,
        notes: parsed.data.notes ?? null,
        status: "in_progress",
        createdBy: req.auth!.userId,
      }).returning();

      if (medicines.length > 0) {
        await tx.insert(stocktakeItemsTable).values(
          medicines.map((m) => ({
            stocktakeId: st.id,
            medicineId: m.id,
            medicineName: m.name,
            systemQuantity: m.quantity ?? 0,
            countedQuantity: null as number | null,
          }))
        );
      }
      return st;
    });

    await logAudit(req.auth!.userId, "CREATE", "stocktake", stocktake.id, `Started stocktake ${reference} (${medicines.length} items)`);
    res.status(201).json(stocktake);
  } catch (err) {
    res.status(500).json({ error: "Failed to create stocktake.", detail: getDbErrorMessage(err) });
  }
});

// Get a single stocktake with its items
router.get("/stocktakes/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!id) { res.status(400).json({ error: "Invalid ID." }); return; }

  try {
    const [stocktake] = await db.select().from(stocktakesTable).where(eq(stocktakesTable.id, id));
    if (!stocktake) { res.status(404).json({ error: "Stocktake not found." }); return; }

    const items = await db
      .select()
      .from(stocktakeItemsTable)
      .where(eq(stocktakeItemsTable.stocktakeId, id))
      .orderBy(stocktakeItemsTable.medicineName);

    res.json({ ...stocktake, items });
  } catch (err) {
    res.status(500).json({ error: "Failed to load stocktake.", detail: getDbErrorMessage(err) });
  }
});

// Update counted quantity for a single item
router.patch("/stocktakes/:id/items/:itemId", requireAuth, async (req, res): Promise<void> => {
  const stocktakeId = parseInt(req.params.id, 10);
  const itemId = parseInt(req.params.itemId, 10);
  const bodySchema = z.object({
    countedQuantity: z.number().int().min(0).nullable(),
    notes: z.string().optional(),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const [stocktake] = await db.select({ status: stocktakesTable.status }).from(stocktakesTable).where(eq(stocktakesTable.id, stocktakeId));
    if (!stocktake) { res.status(404).json({ error: "Stocktake not found." }); return; }
    if (stocktake.status === "finalized") { res.status(400).json({ error: "Cannot edit a finalized stocktake." }); return; }

    const updates: { countedQuantity: number | null; notes?: string } = { countedQuantity: parsed.data.countedQuantity };
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;

    const [updated] = await db
      .update(stocktakeItemsTable)
      .set(updates)
      .where(eq(stocktakeItemsTable.id, itemId))
      .returning();

    if (!updated) { res.status(404).json({ error: "Item not found." }); return; }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update item.", detail: getDbErrorMessage(err) });
  }
});

// Finalize — apply all counted quantities to medicine stock and lock the stocktake
router.post("/stocktakes/:id/finalize", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!id) { res.status(400).json({ error: "Invalid ID." }); return; }

  try {
    const [stocktake] = await db.select().from(stocktakesTable).where(eq(stocktakesTable.id, id));
    if (!stocktake) { res.status(404).json({ error: "Stocktake not found." }); return; }
    if (stocktake.status === "finalized") { res.status(400).json({ error: "This stocktake is already finalized." }); return; }

    const items = await db.select().from(stocktakeItemsTable).where(eq(stocktakeItemsTable.stocktakeId, id));
    // Only adjust items that were actually counted and differ from system
    const adjustable = items.filter((i) => i.countedQuantity != null && i.countedQuantity !== i.systemQuantity);

    await db.transaction(async (tx) => {
      for (const item of adjustable) {
        await tx
          .update(medicinesTable)
          .set({ quantity: item.countedQuantity! })
          .where(eq(medicinesTable.id, item.medicineId));
      }
      await tx
        .update(stocktakesTable)
        .set({ status: "finalized", finalizedBy: req.auth!.userId, finalizedAt: new Date() })
        .where(eq(stocktakesTable.id, id));
    });

    await logAudit(
      req.auth!.userId, "UPDATE", "stocktake", id,
      `Finalized stocktake ${stocktake.reference} — ${adjustable.length} stock adjustment(s)`
    );
    res.json({ message: "Stocktake finalized.", adjustments: adjustable.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to finalize stocktake.", detail: getDbErrorMessage(err) });
  }
});

export default router;
