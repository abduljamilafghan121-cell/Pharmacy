import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, purchaseOrdersTable, purchaseOrderItemsTable, medicinesTable, suppliersTable } from "@workspace/db";
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

router.post("/purchase-orders", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const parsed = CreatePurchaseOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { supplierId, items } = parsed.data;
  const total = items.reduce((sum, i) => sum + parseFloat(i.unitPrice) * i.quantity, 0);

  const [po] = await db.insert(purchaseOrdersTable).values({
    supplierId,
    total: total.toFixed(2),
  }).returning();

  for (const item of items) {
    await db.insert(purchaseOrderItemsTable).values({
      purchaseOrderId: po.id,
      medicineId: item.medicineId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    });
  }

  const full = await fetchPurchaseOrder(po.id);
  res.status(201).json(full);
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

router.patch("/purchase-orders/:id/receive", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const params = ReceivePurchaseOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, params.data.id));
  if (!po) { res.status(404).json({ error: "Purchase order not found" }); return; }

  const items = await db.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.purchaseOrderId, po.id));
  for (const item of items) {
    const [med] = await db.select().from(medicinesTable).where(eq(medicinesTable.id, item.medicineId));
    if (med) {
      await db.update(medicinesTable).set({ quantity: med.quantity + item.quantity }).where(eq(medicinesTable.id, med.id));
    }
  }

  await db.update(purchaseOrdersTable).set({ status: "received" }).where(eq(purchaseOrdersTable.id, po.id));
  const full = await fetchPurchaseOrder(po.id);
  res.json(full);
});

export default router;
