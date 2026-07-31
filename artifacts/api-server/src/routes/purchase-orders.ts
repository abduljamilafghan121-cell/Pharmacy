import { Router, type IRouter } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, purchaseOrdersTable, purchaseOrderItemsTable, medicinesTable, suppliersTable, medicineUnitsTable, medicineBatchesTable } from "@workspace/db";
import { refreshMedicineAggregate } from "../lib/batch-helpers";
import { z } from "zod";
import {
  CreatePurchaseOrderBody, GetPurchaseOrderParams, ReceivePurchaseOrderParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";

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
  res.json(pos.map((po) => ({ ...po, items: [] })));
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

// Optional body: per-item batch number and expiry date supplied at receiving time
const ReceiveBody = z.object({
  items: z.array(z.object({
    medicineId: z.number().int().positive(),
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

      // Create a batch record for this received lot — this is what FEFO draws from.
      await tx.insert(medicineBatchesTable).values({
        medicineId: item.medicineId,
        batchNumber: override?.batchNumber ?? null,
        expiryDate: override?.expiryDate ?? null,
        quantity: baseUnitsToAdd,
        costPrice: costPerBaseUnit,
        supplierId: po.supplierId,
        purchaseOrderId: po.id,
      });

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
  res.json(full);
});

export default router;
