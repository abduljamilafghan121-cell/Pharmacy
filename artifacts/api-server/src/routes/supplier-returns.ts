import { Router, type IRouter } from "express";
import { eq, and, sql, desc } from "drizzle-orm";
import {
  db, supplierReturnsTable, supplierReturnItemsTable, medicineBatchesTable,
  medicinesTable, suppliersTable, supplierPaymentsTable,
} from "@workspace/db";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { getDbErrorMessage } from "../lib/api-errors";
import { refreshMedicineAggregate } from "../lib/batch-helpers";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

const CreateSupplierReturnBody = z.object({
  supplierId: z.number().int().positive(),
  purchaseOrderId: z.number().int().positive().optional(),
  reason: z.string().min(1),
  items: z.array(z.object({
    medicineId: z.number().int().positive(),
    medicineBatchId: z.number().int().positive(), // returns target a specific received batch
    quantity: z.number().int().min(1),
    unitCost: z.number().min(0).optional(), // defaults to the batch's recorded cost
  })).min(1),
});

router.get("/supplier-returns", requireAuth, requireRole("admin", "pharmacist", "viewer"), async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select({
        id: supplierReturnsTable.id,
        supplierId: supplierReturnsTable.supplierId,
        supplierName: suppliersTable.name,
        purchaseOrderId: supplierReturnsTable.purchaseOrderId,
        reason: supplierReturnsTable.reason,
        totalAmount: supplierReturnsTable.totalAmount,
        createdAt: supplierReturnsTable.createdAt,
      })
      .from(supplierReturnsTable)
      .leftJoin(suppliersTable, eq(supplierReturnsTable.supplierId, suppliersTable.id))
      .orderBy(desc(supplierReturnsTable.createdAt));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to load supplier returns.", detail: getDbErrorMessage(err) });
  }
});

router.get("/supplier-returns/:id", requireAuth, requireRole("admin", "pharmacist", "viewer"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id." }); return; }
  try {
    const [ret] = await db
      .select({
        id: supplierReturnsTable.id,
        supplierId: supplierReturnsTable.supplierId,
        supplierName: suppliersTable.name,
        purchaseOrderId: supplierReturnsTable.purchaseOrderId,
        reason: supplierReturnsTable.reason,
        totalAmount: supplierReturnsTable.totalAmount,
        createdAt: supplierReturnsTable.createdAt,
      })
      .from(supplierReturnsTable)
      .leftJoin(suppliersTable, eq(supplierReturnsTable.supplierId, suppliersTable.id))
      .where(eq(supplierReturnsTable.id, id));
    if (!ret) { res.status(404).json({ error: "Supplier return not found." }); return; }

    const items = await db
      .select({
        id: supplierReturnItemsTable.id,
        medicineId: supplierReturnItemsTable.medicineId,
        medicineName: medicinesTable.name,
        medicineBatchId: supplierReturnItemsTable.medicineBatchId,
        quantity: supplierReturnItemsTable.quantity,
        unitCost: supplierReturnItemsTable.unitCost,
        lineTotal: supplierReturnItemsTable.lineTotal,
      })
      .from(supplierReturnItemsTable)
      .leftJoin(medicinesTable, eq(supplierReturnItemsTable.medicineId, medicinesTable.id))
      .where(eq(supplierReturnItemsTable.supplierReturnId, id));

    res.json({ ...ret, items });
  } catch (err) {
    res.status(500).json({ error: "Failed to load supplier return.", detail: getDbErrorMessage(err) });
  }
});

router.post("/supplier-returns", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const parsed = CreateSupplierReturnBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      let totalAmount = 0;
      const lineData: { medicineId: number; medicineBatchId: number; quantity: number; unitCost: number; lineTotal: number }[] = [];

      for (const item of parsed.data.items) {
        const [batch] = await tx.select().from(medicineBatchesTable).where(eq(medicineBatchesTable.id, item.medicineBatchId));
        if (!batch || batch.medicineId !== item.medicineId) {
          return { error: `Batch not found for medicine ${item.medicineId}.` as const };
        }
        if (batch.quantity < item.quantity) {
          return { error: `Only ${batch.quantity} units remain in that batch — can't return ${item.quantity}.` as const };
        }

        const unitCost = item.unitCost ?? parseFloat(batch.costPrice ?? "0");
        const lineTotal = unitCost * item.quantity;
        totalAmount += lineTotal;
        lineData.push({ medicineId: item.medicineId, medicineBatchId: item.medicineBatchId, quantity: item.quantity, unitCost, lineTotal });

        // Atomic, race-safe deduction from the exact batch being returned.
        const [updated] = await tx
          .update(medicineBatchesTable)
          .set({ quantity: sql`${medicineBatchesTable.quantity} - ${item.quantity}` })
          .where(and(eq(medicineBatchesTable.id, batch.id), sql`${medicineBatchesTable.quantity} >= ${item.quantity}`))
          .returning({ id: medicineBatchesTable.id });
        if (!updated) {
          return { error: `Batch stock changed — please retry the return.` as const };
        }
        await refreshMedicineAggregate(tx, item.medicineId);
      }

      const [supplierReturn] = await tx.insert(supplierReturnsTable).values({
        supplierId: parsed.data.supplierId,
        purchaseOrderId: parsed.data.purchaseOrderId ?? null,
        reason: parsed.data.reason,
        totalAmount: totalAmount.toFixed(2),
        createdBy: req.auth!.userId,
      }).returning();

      for (const line of lineData) {
        await tx.insert(supplierReturnItemsTable).values({
          supplierReturnId: supplierReturn.id,
          medicineId: line.medicineId,
          medicineBatchId: line.medicineBatchId,
          quantity: line.quantity,
          unitCost: line.unitCost.toFixed(4),
          lineTotal: line.lineTotal.toFixed(2),
        });
      }

      // Credit the supplier ledger — this shows up as reducing what we owe
      // them, the same way an existing supplier_payments entry does. The
      // supplier-ledger balance calc (totalOrdered - totalPaid) treats any
      // row here as reducing balance, which is exactly right for a credit.
      await tx.insert(supplierPaymentsTable).values({
        supplierId: parsed.data.supplierId,
        purchaseOrderId: parsed.data.purchaseOrderId ?? null,
        amount: totalAmount.toFixed(2),
        method: "credit",
        note: `Supplier return credit — ${parsed.data.reason}`,
      });

      const [supplier] = await tx.select({ name: suppliersTable.name }).from(suppliersTable).where(eq(suppliersTable.id, parsed.data.supplierId));

      return { id: supplierReturn.id, totalAmount, supplierName: supplier?.name ?? "supplier", itemCount: lineData.length };
    });

    if ("error" in result) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json({ id: result.id, totalAmount: result.totalAmount.toFixed(2) });
    logAudit(req.auth!.userId, "supplier_return.create", "supplier_return", result.id,
      `Returned ${result.itemCount} item(s) to ${result.supplierName} for a credit of ${result.totalAmount.toFixed(2)} — reason: ${parsed.data.reason}.`);
  } catch (err) {
    res.status(500).json({ error: "Failed to process supplier return.", detail: getDbErrorMessage(err) });
  }
});

export default router;
