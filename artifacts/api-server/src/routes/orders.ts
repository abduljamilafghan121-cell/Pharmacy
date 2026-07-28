import { Router, type IRouter } from "express";
import { eq, sql, inArray } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, orderItemReturnsTable, medicinesTable, usersTable, paymentsTable, medicineUnitsTable, pharmacySettingsTable, prescriptionsTable } from "@workspace/db";
import { z } from "zod";
import {
  CreateOrderBody, UpdateOrderStatusBody,
  GetOrderParams, UpdateOrderStatusParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

router.get("/orders", requireAuth, async (req, res): Promise<void> => {
  const pageRaw = req.query["page"];
  const limitRaw = req.query["limit"];
  const paginate = pageRaw != null || limitRaw != null;
  const limit = Math.min(Math.max(parseInt(String(limitRaw ?? "50"), 10) || 50, 1), 200);
  const page = Math.max(parseInt(String(pageRaw ?? "1"), 10) || 1, 1);
  const offset = (page - 1) * limit;

  const query = db
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

  if (paginate) {
    const [rows, countResult] = await Promise.all([
      query.limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(ordersTable),
    ]);
    res.json({ data: rows, total: countResult[0]?.count ?? 0, page, limit });
  } else {
    const rows = await query;
    res.json(rows);
  }
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

  // Optional fields not in the generated schema
  const discountRaw = (req.body as Record<string, unknown>).discountAmount;
  const discountAmount = typeof discountRaw === "number" && discountRaw >= 0 ? discountRaw : 0;
  const prescriptionIdRaw = (req.body as Record<string, unknown>).prescriptionId;
  const prescriptionId = typeof prescriptionIdRaw === "number" && prescriptionIdRaw > 0 ? prescriptionIdRaw : null;

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

  // Prescription enforcement — if any medicine requires a prescription, a verified
  // prescription must be attached to the order.
  const requiresRx = resolvedItems.some((ri) => ri.med.prescriptionRequired);
  if (requiresRx) {
    if (!prescriptionId) {
      res.status(400).json({ error: "One or more medicines require a prescription. Please attach a verified prescription to this order." });
      return;
    }
    const [prescription] = await db
      .select({ id: prescriptionsTable.id, status: prescriptionsTable.status })
      .from(prescriptionsTable)
      .where(eq(prescriptionsTable.id, prescriptionId));
    if (!prescription) {
      res.status(404).json({ error: "Prescription not found." });
      return;
    }
    if (prescription.status !== "verified") {
      res.status(400).json({ error: "The attached prescription has not been verified yet. Only verified prescriptions can authorise a sale." });
      return;
    }
  }

  // Compute totals — price per base unit × base units needed
  let subtotal = 0;
  for (const ri of resolvedItems) {
    subtotal += parseFloat(ri.med.price) * ri.baseUnitsNeeded;
  }

  // Apply discount then tax
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const [settingsRow] = await db.select({ taxRatePercent: pharmacySettingsTable.taxRatePercent })
    .from(pharmacySettingsTable).where(eq(pharmacySettingsTable.id, 1));
  const taxRatePct = settingsRow ? parseFloat(settingsRow.taxRatePercent) : 0;
  const taxAmount = (afterDiscount * taxRatePct) / 100;
  const total = afterDiscount + taxAmount;

  // Run order creation, stock decrement, and payment inside a single transaction
  const { order, orderItems, staffName } = await db.transaction(async (tx) => {
    const [order] = await tx.insert(ordersTable).values({
      patientId: patientId ?? null,
      patientName: patientName ?? null,
      prescriptionId: prescriptionId,
      servedBy: req.auth!.userId,
      subtotal: subtotal.toFixed(2),
      discountAmount: discountAmount.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
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
      // Atomic stock deduction — avoids read-modify-write race under concurrent sales
      await tx.update(medicinesTable)
        .set({ quantity: sql`${medicinesTable.quantity} - ${ri.baseUnitsNeeded}` })
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

  await logAudit(req.auth!.userId, "CREATE", "order", order.id,
    `New sale #${order.id} — total ${order.total} (${orderItems.length} item(s))`);
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

    // Restore stock when cancelling a dispensed order — atomic increments
    if (isCancelling) {
      const items = await tx
        .select()
        .from(orderItemsTable)
        .where(eq(orderItemsTable.orderId, existing.id));
      for (const item of items) {
        const conversionFactor = item.conversionFactorToBase ?? 1;
        const baseUnitsToRestore = item.quantity * conversionFactor;
        await tx
          .update(medicinesTable)
          .set({ quantity: sql`${medicinesTable.quantity} + ${baseUnitsToRestore}` })
          .where(eq(medicinesTable.id, item.medicineId));
      }
    }

    // Build order update payload — include paymentStatus in the DB update itself,
    // not just in the response, so reloading the order shows the correct status.
    const orderUpdates: Record<string, unknown> = { status: parsed.data.status };
    if (isCancelling && existing.paymentStatus === "paid") {
      orderUpdates.paymentStatus = "refunded";
    }
    if (isCancelling && refundNote) {
      const existingNotes = existing.notes ? `${existing.notes}\n` : "";
      orderUpdates.notes = `${existingNotes}Refund reason: ${refundNote}`;
    }

    const [updated] = await tx
      .update(ordersTable)
      .set(orderUpdates)
      .where(eq(ordersTable.id, params.data.id))
      .returning();

    // Mark payment row as refunded when cancelling a paid order
    if (isCancelling && existing.paymentStatus === "paid") {
      await tx
        .update(paymentsTable)
        .set({ status: "refunded" })
        .where(eq(paymentsTable.orderId, existing.id));
    }

    return updated;
  });

  if (!row) { res.status(404).json({ error: "Sale not found" }); return; }
  await logAudit(req.auth!.userId, "UPDATE_STATUS", "order", params.data.id,
    `Order #${params.data.id} status changed to "${parsed.data.status}"`);
  res.json({ ...row, servedByName: null });
});

// ── Partial item return (T3.11) ────────────────────────────────────────────

const ReturnItemParams = z.object({
  id: z.coerce.number().int().positive(),
  itemId: z.coerce.number().int().positive(),
});
const ReturnItemBody = z.object({
  quantity: z.number().int().min(1),
  reason: z.string().optional(),
});

router.post("/orders/:id/items/:itemId/return", requireAuth, async (req, res): Promise<void> => {
  const params = ReturnItemParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = ReturnItemBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const { id: orderId, itemId } = params.data;
  const { quantity, reason } = body.data;

  try {
    const result = await db.transaction(async (tx) => {
      const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, orderId));
      if (!order) return { error: "Sale not found", status: 404 };
      if (order.status === "cancelled") return { error: "Cannot return items from a cancelled sale.", status: 400 };

      const [item] = await tx.select().from(orderItemsTable).where(
        sql`${orderItemsTable.id} = ${itemId} AND ${orderItemsTable.orderId} = ${orderId}`
      );
      if (!item) return { error: "Item not found on this sale.", status: 404 };

      const alreadyReturned = item.returnedQuantity ?? 0;
      const returnable = item.quantity - alreadyReturned;
      if (quantity > returnable) {
        return { error: `Can only return up to ${returnable} more unit(s) of this item.`, status: 400 };
      }

      const unitPrice = parseFloat(item.price) / item.quantity;
      const refundAmount = unitPrice * quantity * (item.conversionFactorToBase ?? 1);

      // Record the return
      await tx.insert(orderItemReturnsTable).values({
        orderItemId: itemId,
        quantity,
        reason: reason ?? null,
        refundAmount: refundAmount.toFixed(2),
        processedBy: req.auth!.userId,
      });

      // Update returned quantity on the item
      await tx.update(orderItemsTable)
        .set({ returnedQuantity: alreadyReturned + quantity })
        .where(eq(orderItemsTable.id, itemId));

      // Atomic stock restoration (base units)
      const baseUnitsToRestore = quantity * (item.conversionFactorToBase ?? 1);
      await tx.update(medicinesTable)
        .set({ quantity: sql`${medicinesTable.quantity} + ${baseUnitsToRestore}` })
        .where(eq(medicinesTable.id, item.medicineId));

      // Adjust order total
      const newTotal = Math.max(0, parseFloat(order.total) - refundAmount);
      await tx.update(ordersTable)
        .set({ total: newTotal.toFixed(2) })
        .where(eq(ordersTable.id, orderId));

      return { message: "Return processed.", refundAmount: refundAmount.toFixed(2), newTotal: newTotal.toFixed(2) };
    });

    if ("error" in result) {
      res.status((result as any).status ?? 400).json({ error: result.error });
      return;
    }
    await logAudit(req.auth!.userId, "RETURN", "order", orderId,
      `Partial return on order #${orderId} — item #${itemId}, qty ${quantity}, refund ${result.refundAmount}`);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to process return." });
  }
});

export default router;
