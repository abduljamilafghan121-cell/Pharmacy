import { Router, type IRouter } from "express";
import { eq, sql, inArray } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, medicinesTable, usersTable, paymentsTable, medicineUnitsTable } from "@workspace/db";
import { z } from "zod";
import {
  CreateOrderBody, UpdateOrderStatusBody,
  GetOrderParams, UpdateOrderStatusParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/orders", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: ordersTable.id,
      patientId: ordersTable.patientId,
      patientName: ordersTable.patientName,
      servedByName: usersTable.name,
      status: ordersTable.status,
      subtotal: ordersTable.subtotal,
      total: ordersTable.total,
      paymentStatus: ordersTable.paymentStatus,
      notes: ordersTable.notes,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .leftJoin(usersTable, eq(ordersTable.servedBy, usersTable.id))
    .orderBy(sql`${ordersTable.createdAt} DESC`);
  res.json(rows);
});

// Extended item input schema: standard fields + optional unitId
const OrderItemInputExtended = z.object({
  medicineId: z.number().int().positive(),
  quantity: z.number().int().min(1),
  unitId: z.number().int().positive().optional(),
});

router.post("/orders", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Parse extended items (adds unitId support on top of the generated schema)
  const itemsRaw = z.array(OrderItemInputExtended).safeParse(req.body.items);
  if (!itemsRaw.success) {
    res.status(400).json({ error: itemsRaw.error.message });
    return;
  }

  const { patientId, patientName, paymentMethod = "cash", notes } = parsed.data;
  const items = itemsRaw.data;

  // Fetch all medicines
  const medicineIds = items.map((i) => i.medicineId);
  const medicines = await db.select().from(medicinesTable).where(inArray(medicinesTable.id, medicineIds));

  // Resolve unit conversion factors
  const unitIds = items.map((i) => i.unitId).filter((id): id is number => id != null);
  const units = unitIds.length > 0
    ? await db.select().from(medicineUnitsTable).where(inArray(medicineUnitsTable.id, unitIds))
    : [];

  // Build per-item resolved data
  const resolvedItems = items.map((item) => {
    const med = medicines.find((m) => m.id === item.medicineId)!;
    const unit = item.unitId ? units.find((u) => u.id === item.unitId) : null;
    const conversionFactor = unit?.conversionFactorToBase ?? 1;
    const unitName = unit?.unitName ?? null;
    const baseUnitsNeeded = item.quantity * conversionFactor;
    return { ...item, med, unit, conversionFactor, unitName, baseUnitsNeeded };
  });

  // Validate stock (in base units) and expiry
  for (const ri of resolvedItems) {
    if (!ri.med) {
      res.status(400).json({ error: `Medicine ${ri.medicineId} not found` });
      return;
    }
    if (ri.med.quantity < ri.baseUnitsNeeded) {
      const availStr = ri.med.quantity === 0 ? "out of stock" : `${ri.med.quantity} base units available`;
      res.status(400).json({ error: `Insufficient stock for ${ri.med.name} (${availStr})` });
      return;
    }
    if (ri.med.expiryDate && ri.med.expiryDate < new Date().toISOString().slice(0, 10)) {
      res.status(400).json({ error: `${ri.med.name} has expired and cannot be sold.` });
      return;
    }
  }

  // Compute totals — price per base unit × base units needed
  let subtotal = 0;
  for (const ri of resolvedItems) {
    subtotal += parseFloat(ri.med.price) * ri.baseUnitsNeeded;
  }
  const total = subtotal;

  // Run order creation, stock decrement, and payment inside a single transaction
  const { order, orderItems, staffName } = await db.transaction(async (tx) => {
    const [order] = await tx.insert(ordersTable).values({
      patientId: patientId ?? null,
      patientName: patientName ?? null,
      servedBy: req.auth!.userId,
      subtotal: subtotal.toFixed(2),
      total: total.toFixed(2),
      status: "dispensed",
      paymentStatus: "paid",
      notes: notes ?? null,
    }).returning();

    const orderItems = [];
    for (const ri of resolvedItems) {
      const unitPrice = parseFloat(ri.med.price);
      const lineTotal = unitPrice * ri.baseUnitsNeeded;
      const [oi] = await tx.insert(orderItemsTable).values({
        orderId: order.id,
        medicineId: ri.medicineId,
        quantity: ri.quantity,
        unitName: ri.unitName,
        conversionFactorToBase: ri.conversionFactor,
        price: lineTotal.toFixed(2),
      }).returning();
      orderItems.push({ ...oi, medicineName: ri.med.name });
      // Deduct base units from stock
      await tx.update(medicinesTable)
        .set({ quantity: ri.med.quantity - ri.baseUnitsNeeded })
        .where(eq(medicinesTable.id, ri.med.id));
    }

    await tx.insert(paymentsTable).values({
      orderId: order.id,
      amount: total.toFixed(2),
      method: paymentMethod,
      status: "completed",
    });

    const [staff] = await tx.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, req.auth!.userId));

    return { order, orderItems, staffName: staff?.name ?? null };
  });

  res.status(201).json({ ...order, servedByName: staffName, items: orderItems });
});

router.get("/orders/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [order] = await db
    .select({
      id: ordersTable.id,
      patientId: ordersTable.patientId,
      patientName: ordersTable.patientName,
      servedByName: usersTable.name,
      status: ordersTable.status,
      subtotal: ordersTable.subtotal,
      total: ordersTable.total,
      paymentStatus: ordersTable.paymentStatus,
      notes: ordersTable.notes,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .leftJoin(usersTable, eq(ordersTable.servedBy, usersTable.id))
    .where(eq(ordersTable.id, params.data.id));
  if (!order) { res.status(404).json({ error: "Sale not found" }); return; }

  const items = await db
    .select({
      id: orderItemsTable.id,
      orderId: orderItemsTable.orderId,
      medicineId: orderItemsTable.medicineId,
      medicineName: medicinesTable.name,
      quantity: orderItemsTable.quantity,
      unitName: orderItemsTable.unitName,
      conversionFactorToBase: orderItemsTable.conversionFactorToBase,
      price: orderItemsTable.price,
    })
    .from(orderItemsTable)
    .leftJoin(medicinesTable, eq(orderItemsTable.medicineId, medicinesTable.id))
    .where(eq(orderItemsTable.orderId, params.data.id));

  res.json({ ...order, items });
});

router.patch("/orders/:id/status", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateOrderStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateOrderStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const refundNoteRaw = (req.body as Record<string, unknown>).refundNote;
  const refundNote = typeof refundNoteRaw === "string" && refundNoteRaw.trim() ? refundNoteRaw.trim() : null;

  const row = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, params.data.id));
    if (!existing) return null;

    const isCancelling = parsed.data.status === "cancelled" && existing.status === "dispensed";

    // Restore stock when cancelling a dispensed order (using base units)
    if (isCancelling) {
      const items = await tx
        .select()
        .from(orderItemsTable)
        .where(eq(orderItemsTable.orderId, existing.id));
      for (const item of items) {
        const conversionFactor = item.conversionFactorToBase ?? 1;
        const baseUnitsToRestore = item.quantity * conversionFactor;
        const [med] = await tx
          .select({ quantity: medicinesTable.quantity })
          .from(medicinesTable)
          .where(eq(medicinesTable.id, item.medicineId));
        if (med) {
          await tx
            .update(medicinesTable)
            .set({ quantity: med.quantity + baseUnitsToRestore })
            .where(eq(medicinesTable.id, item.medicineId));
        }
      }
    }

    // Build order update payload
    const orderUpdates: Record<string, unknown> = { status: parsed.data.status };
    if (isCancelling && refundNote) {
      const existingNotes = existing.notes ? `${existing.notes}\n` : "";
      orderUpdates.notes = `${existingNotes}Refund reason: ${refundNote}`;
    }

    const [updated] = await tx
      .update(ordersTable)
      .set(orderUpdates)
      .where(eq(ordersTable.id, params.data.id))
      .returning();

    // Mark payment as refunded when cancelling a paid order
    if (isCancelling && existing.paymentStatus === "paid") {
      await tx
        .update(paymentsTable)
        .set({ status: "refunded" })
        .where(eq(paymentsTable.orderId, existing.id));
      return { ...updated, paymentStatus: "refunded" as const };
    }

    return updated;
  });

  if (!row) { res.status(404).json({ error: "Sale not found" }); return; }
  res.json({ ...row, servedByName: null });
});

export default router;
