import { Router, type IRouter } from "express";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, purchaseOrdersTable, purchaseOrderItemsTable, medicinesTable, suppliersTable, medicineUnitsTable, medicineBatchesTable } from "@workspace/db";
import { refreshMedicineAggregate } from "../lib/batch-helpers";
import { z } from "zod";
import {
  CreatePurchaseOrderBody, GetPurchaseOrderParams, ReceivePurchaseOrderParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

async function fetchPurchaseOrder(id: number) {
  const [po] = await db
    .select({
      id: purchaseOrdersTable.id,
      supplierId: purchaseOrdersTable.supplierId,
      supplierName: suppliersTable.name,
      status: purchaseOrdersTable.status,
      total: purchaseOrdersTable.total,
      createdAt: purchaseOrdersTable.createdAt,
    })
    .from(purchaseOrdersTable)
    .leftJoin(suppliersTable, eq(purchaseOrdersTable.supplierId, suppliersTable.id))
    .where(eq(purchaseOrdersTable.id, id));
  if (!po) return null;

  const items = await db
    .select({
      id: purchaseOrderItemsTable.id,
      purchaseOrderId: purchaseOrderItemsTable.purchaseOrderId,
      medicineId: purchaseOrderItemsTable.medicineId,
      medicineName: medicinesTable.name,
      quantity: purchaseOrderItemsTable.quantity,
      unitName: purchaseOrderItemsTable.unitName,
      conversionFactorToBase: purchaseOrderItemsTable.conversionFactorToBase,
      unitPrice: purchaseOrderItemsTable.unitPrice,
    })
    .from(purchaseOrderItemsTable)
    .leftJoin(medicinesTable, eq(purchaseOrderItemsTable.medicineId, medicinesTable.id))
    .where(eq(purchaseOrderItemsTable.purchaseOrderId, id));

  return { ...po, items };
}

router.get("/purchase-orders", requireAuth, requireRole("admin", "pharmacist"), async (_req, res): Promise<void> => {
  const pos = await db
    .select({
      id: purchaseOrdersTable.id,
      supplierId: purchaseOrdersTable.supplierId,
      supplierName: suppliersTable.name,
      status: purchaseOrdersTable.status,
      total: purchaseOrdersTable.total,
      createdAt: purchaseOrdersTable.createdAt,
    })
    .from(purchaseOrdersTable)
    .leftJoin(suppliersTable, eq(purchaseOrdersTable.supplierId, suppliersTable.id))
    .orderBy(purchaseOrdersTable.createdAt);

  // Count line items per order so list UIs can show a real number instead of
  // fetching the full detail for every row. Kept as a single grouped query.
  const counts = await db
    .select({
      purchaseOrderId: purchaseOrderItemsTable.purchaseOrderId,
      count: sql<number>`count(*)::int`,
    })
    .from(purchaseOrderItemsTable)
    .groupBy(purchaseOrderItemsTable.purchaseOrderId);

  const countById = new Map(counts.map((c) => [c.purchaseOrderId, c.count]));

  res.json(
    pos.map((po) => ({
      ...po,
      items: [],
      itemCount: countById.get(po.id) ?? 0,
    })),
  );
});

// Extended item input: standard fields + optional unitId
const PurchaseOrderItemInputExtended = z.object({
  medicineId: z.number().int().positive(),
  quantity: z.number().int().min(1),
  unitId: z.number().int().positive().optional(),
  unitPrice: z.string(),
});

router.post("/purchase-orders", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const parsed = CreatePurchaseOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const itemsRaw = z.array(PurchaseOrderItemInputExtended).safeParse(req.body.items);
  if (!itemsRaw.success) {
    res.status(400).json({ error: itemsRaw.error.message });
    return;
  }

  const { supplierId } = parsed.data;
  const items = itemsRaw.data;

  // Resolve unit conversion factors
  const unitIds = items.map((i) => i.unitId).filter((id): id is number => id != null);
  const units = unitIds.length > 0
    ? await db.select().from(medicineUnitsTable).where(inArray(medicineUnitsTable.id, unitIds))
    : [];

  const resolvedItems = items.map((item) => {
    const unit = item.unitId ? units.find((u) => u.id === item.unitId) : null;
    return {
      ...item,
      unitName: unit?.unitName ?? null,
      conversionFactor: unit?.conversionFactorToBase ?? 1,
    };
  });

  const total = resolvedItems.reduce((sum, i) => sum + parseFloat(i.unitPrice) * i.quantity, 0);

  const poId = await db.transaction(async (tx) => {
    const [po] = await tx.insert(purchaseOrdersTable).values({
      supplierId,
      total: total.toFixed(2),
    }).returning();

    for (const item of resolvedItems) {
      await tx.insert(purchaseOrderItemsTable).values({
        purchaseOrderId: po.id,
        medicineId: item.medicineId,
        quantity: item.quantity,
        unitName: item.unitName,
        conversionFactorToBase: item.conversionFactor,
        unitPrice: item.unitPrice,
      });
    }

    return po.id;
  });

  const full = await fetchPurchaseOrder(poId);
  const [supplier] = await db.select({ name: suppliersTable.name }).from(suppliersTable).where(eq(suppliersTable.id, supplierId));
  await logAudit(req.auth!.userId, "create", "purchase_order", poId, `Created purchase order #${poId} for ${supplier?.name ?? "supplier"} with ${items.length} item(s).`);
  res.status(201).json(full);
});

// ── Supplier Price History ────────────────────────────────────────────────────
// Returns the last 20 purchase prices for a medicine across all suppliers.
router.get("/purchase-orders/price-history", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const medicineId = Number(req.query["medicineId"]);
  if (!medicineId || isNaN(medicineId)) {
    res.status(400).json({ error: "medicineId query parameter is required." });
    return;
  }
  try {
    const rows = await db
      .select({
        supplierId: purchaseOrdersTable.supplierId,
        supplierName: suppliersTable.name,
        unitPrice: purchaseOrderItemsTable.unitPrice,
        unitName: purchaseOrderItemsTable.unitName,
        quantity: purchaseOrderItemsTable.quantity,
        orderedAt: purchaseOrdersTable.createdAt,
        status: purchaseOrdersTable.status,
      })
      .from(purchaseOrderItemsTable)
      .leftJoin(purchaseOrdersTable, eq(purchaseOrderItemsTable.purchaseOrderId, purchaseOrdersTable.id))
      .leftJoin(suppliersTable, eq(purchaseOrdersTable.supplierId, suppliersTable.id))
      .where(eq(purchaseOrderItemsTable.medicineId, medicineId))
      .orderBy(sql`${purchaseOrdersTable.createdAt} DESC`)
      .limit(20);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to load price history.", detail: String(err) });
  }
});

router.get("/purchase-orders/:id", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const params = GetPurchaseOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const po = await fetchPurchaseOrder(params.data.id);
  if (!po) { res.status(404).json({ error: "Purchase order not found" }); return; }
  res.json(po);
});

// Optional body: per-item batch instructions supplied at receiving time.
// - batchId: an existing, non-expired batch (for this medicine) to top up —
//   takes precedence over batchNumber when present.
// - batchNumber/expiryDate: used for a new batch, or to merge into an
//   existing batch that already carries the same lot number.
const ReceiveBody = z.object({
  items: z.array(z.object({
    medicineId: z.number().int().positive(),
    batchId: z.number().int().positive().optional().nullable(),
    batchNumber: z.string().max(100).optional().nullable(),
    expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  })).optional(),
});

router.patch("/purchase-orders/:id/receive", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const params = ReceivePurchaseOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const bodyParsed = ReceiveBody.safeParse(req.body ?? {});
  const batchOverrides = new Map(
    (bodyParsed.success ? bodyParsed.data.items ?? [] : []).map((i) => [i.medicineId, i])
  );

  const receivedId = await db.transaction(async (tx) => {
    const [po] = await tx
      .update(purchaseOrdersTable)
      .set({ status: "received" })
      .where(and(eq(purchaseOrdersTable.id, params.data.id), eq(purchaseOrdersTable.status, "pending")))
      .returning({ id: purchaseOrdersTable.id, supplierId: purchaseOrdersTable.supplierId });
    if (!po) return null;

    const items = await tx
      .select()
      .from(purchaseOrderItemsTable)
      .where(eq(purchaseOrderItemsTable.purchaseOrderId, po.id));

    for (const item of items) {
      const conversionFactor = item.conversionFactorToBase ?? 1;
      const baseUnitsToAdd = item.quantity * conversionFactor;
      const override = batchOverrides.get(item.medicineId);
      // Cost per base unit: item unit price / conversion factor
      const costPerBaseUnit = item.unitPrice
        ? (parseFloat(item.unitPrice) / conversionFactor).toFixed(4)
        : null;

      // Figure out whether this delivery belongs to a batch we already have.
      // Preference order: an explicit batchId the receiver picked from the
      // "existing batches" dropdown, then a matching batchNumber typed in by
      // hand. Written-off batches are never merge targets — that lot was
      // formally closed out, so a fresh arrival under the same number starts
      // a new row instead of reviving it.
      let targetBatch: { id: number; quantity: number; costPrice: string | null } | null = null;

      if (override?.batchId) {
        const [byId] = await tx
          .select({ id: medicineBatchesTable.id, quantity: medicineBatchesTable.quantity, costPrice: medicineBatchesTable.costPrice })
          .from(medicineBatchesTable)
          .where(and(
            eq(medicineBatchesTable.id, override.batchId),
            eq(medicineBatchesTable.medicineId, item.medicineId),
            isNull(medicineBatchesTable.writeOffAt),
          ));
        targetBatch = byId ?? null;
      } else if (override?.batchNumber) {
        const [byNumber] = await tx
          .select({ id: medicineBatchesTable.id, quantity: medicineBatchesTable.quantity, costPrice: medicineBatchesTable.costPrice })
          .from(medicineBatchesTable)
          .where(and(
            eq(medicineBatchesTable.medicineId, item.medicineId),
            eq(medicineBatchesTable.batchNumber, override.batchNumber),
            isNull(medicineBatchesTable.writeOffAt),
          ));
        targetBatch = byNumber ?? null;
      }

      if (targetBatch) {
        // Merge into the existing lot: add to its remaining quantity and
        // roll the cost into a quantity-weighted average so per-unit cost
        // (and therefore margin/COGS reporting) stays accurate across
        // multiple deliveries of the same batch. Its expiry date is left
        // alone unless this receipt explicitly supplies a different one.
        const existingQty = targetBatch.quantity;
        const existingCost = targetBatch.costPrice ? parseFloat(targetBatch.costPrice) : null;
        const newQty = existingQty + baseUnitsToAdd;
        const blendedCost = existingCost !== null || costPerBaseUnit !== null
          ? (
              ((existingCost ?? 0) * existingQty + (costPerBaseUnit ? parseFloat(costPerBaseUnit) : 0) * baseUnitsToAdd)
              / (newQty || 1)
            ).toFixed(4)
          : null;

        await tx
          .update(medicineBatchesTable)
          .set({
            quantity: newQty,
            costPrice: blendedCost,
            ...(override?.expiryDate ? { expiryDate: override.expiryDate } : {}),
          })
          .where(eq(medicineBatchesTable.id, targetBatch.id));
      } else {
        // No matching batch — this is a genuinely new lot.
        await tx.insert(medicineBatchesTable).values({
          medicineId: item.medicineId,
          batchNumber: override?.batchNumber ?? null,
          expiryDate: override?.expiryDate ?? null,
          quantity: baseUnitsToAdd,
          costPrice: costPerBaseUnit,
          supplierId: po.supplierId,
          purchaseOrderId: po.id,
        });
      }

      // Recompute the medicine aggregate from all batch rows.
      await refreshMedicineAggregate(tx, item.medicineId);
    }
    return po.id;
  });

  if (!receivedId) {
    const [existing] = await db
      .select({ id: purchaseOrdersTable.id, status: purchaseOrdersTable.status })
      .from(purchaseOrdersTable)
      .where(eq(purchaseOrdersTable.id, params.data.id));
    if (!existing) { res.status(404).json({ error: "Purchase order not found" }); return; }
    res.status(409).json({ error: `Purchase order is already ${existing.status}.` });
    return;
  }

  const full = await fetchPurchaseOrder(receivedId);
  await logAudit(req.auth!.userId, "receive", "purchase_order", receivedId, `Received purchase order #${receivedId}${full?.supplierName ? ` from ${full.supplierName}` : ""}.`);
  res.json(full);
});

// POST /purchase-orders/:id/reverse — undo a mistakenly-received purchase order.
//
// Receiving adds stock to medicine_batches (a new lot per PO item, OR a merge
// into an existing lot by batch number). Reversing is only safe when the stock
// has NOT been touched since (no sales, returns, or write-offs against it), and
// only when the received items landed in NEW batch rows owned by this PO.
// Merged lots can't be cleanly split back out, so those are rejected with a
// message (they should be corrected via stock adjustments / returns instead).
router.post(
  "/purchase-orders/:id/reverse",
  requireAuth,
  requireRole("admin", "pharmacist"),
  async (req, res): Promise<void> => {
    const poId = parseInt(String(req.params.id), 10);
    if (isNaN(poId)) {
      res.status(400).json({ error: "Invalid purchase order ID" });
      return;
    }

    const result = await db.transaction(async (tx) => {
      const fail = (code: number, message: string) => ({ ok: false as const, code, error: message });
      const [po] = await tx
        .select({ id: purchaseOrdersTable.id, status: purchaseOrdersTable.status, supplierName: suppliersTable.name })
        .from(purchaseOrdersTable)
        .leftJoin(suppliersTable, eq(purchaseOrdersTable.supplierId, suppliersTable.id))
        .where(eq(purchaseOrdersTable.id, poId));

      if (!po) return fail(404, "Purchase order not found");
      if (po.status !== "received") {
        return fail(409, `Only received purchase orders can be reversed (this one is ${po.status}).`);
      }

      const items = await tx
        .select()
        .from(purchaseOrderItemsTable)
        .where(eq(purchaseOrderItemsTable.purchaseOrderId, poId));

      // Find every batch lot that was created by this receive.
      const created = await tx
        .select()
        .from(medicineBatchesTable)
        .where(and(eq(medicineBatchesTable.purchaseOrderId, poId), isNull(medicineBatchesTable.writeOffAt)));

      // The total base units this receive added per PO item.
      const addedByItem = new Map<number, number>();
      for (const item of items) {
        addedByItem.set(item.medicineId, item.quantity * (item.conversionFactorToBase ?? 1));
      }

      // Group created lots by medicine.
      const createdByMedicine = new Map<number, typeof created>();
      for (const b of created) {
        if (!createdByMedicine.has(b.medicineId)) createdByMedicine.set(b.medicineId, []);
        createdByMedicine.get(b.medicineId)!.push(b);
      }

      // Safety: every item must have landed in a created (non-merged) lot, and
      // every created lot must still hold its full received quantity with no
      // write-off. If any was consumed or merged, refuse to reverse.
      for (const item of items) {
        const lots = createdByMedicine.get(item.medicineId) ?? [];
        const expected = addedByItem.get(item.medicineId) ?? 0;
        if (lots.length === 0) {
          return fail(
            409,
            `Item "${item.medicineId}" was received into a lot that was already combined with existing stock — it can't be cleanly reversed. Correct it with a stock adjustment or supplier return instead.`
          );
        }
        const totalOnLots = lots.reduce((s, l) => s + l.quantity, 0);
        if (totalOnLots < expected) {
          return fail(
            409,
            "This purchase order's stock has already been sold, returned, or written off. Reversing the receipt now would corrupt stock counts — use the supplier return or write-off flows instead."
          );
        }
        if (lots.some((l) => l.writeOffAt)) {
          return fail(409, "One of this purchase order's lots has been written off and can't be reversed.");
        }
      }

      // All safe: remove the created lots and restore the PO to pending.
      const createdIds = created.map((b) => b.id);
      if (createdIds.length) {
        await tx.delete(medicineBatchesTable).where(inArray(medicineBatchesTable.id, createdIds));
      }
      await tx
        .update(purchaseOrdersTable)
        .set({ status: "pending" })
        .where(eq(purchaseOrdersTable.id, poId));

      for (const item of items) {
        await refreshMedicineAggregate(tx, item.medicineId);
      }

      return { ok: true as const, removedLots: createdIds.length };
    });

    if (!result.ok) {
      res.status(result.code).json({ error: result.error });
      return;
    }

    await logAudit(
      req.auth!.userId,
      "receive.reverse",
      "purchase_order",
      poId,
      `Reversed receipt of purchase order #${poId}; removed ${result.removedLots} stock lot(s) and restored it to pending.`
    );
    res.json({ id: poId, status: "pending", removedLots: result.removedLots });
  }
);

export default router;
