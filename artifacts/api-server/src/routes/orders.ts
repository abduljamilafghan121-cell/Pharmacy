import { Router, type IRouter } from "express";
import { eq, sql, inArray, and, or } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, orderItemReturnsTable, medicinesTable, usersTable, paymentsTable, medicineUnitsTable, pharmacySettingsTable, prescriptionsTable, patientAllergiesTable, controlledSubstanceLogsTable, drugInteractionsTable, orderItemBatchAllocationsTable } from "@workspace/db";
import { allocateFefo, restoreAllocations, restoreToAnyBatch } from "../lib/batch-helpers";
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
  sig: z.string().max(500).optional(),
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

  // ── Safety: Drug Interaction Check ────────────────────────────────────────
  // Run server-side too (frontend may be bypassed). Contraindicated pairs are
  // a hard block; major/moderate/minor are surfaced as warnings in the response.
  if (medicineIds.length >= 2) {
    const interactions = await db
      .select({
        medicine1Id: drugInteractionsTable.medicine1Id,
        medicine2Id: drugInteractionsTable.medicine2Id,
        severity: drugInteractionsTable.severity,
        description: drugInteractionsTable.description,
      })
      .from(drugInteractionsTable)
      .where(
        or(
          and(
            inArray(drugInteractionsTable.medicine1Id, medicineIds),
            inArray(drugInteractionsTable.medicine2Id, medicineIds),
          ),
        )!
      );

    const contraindicated = interactions.filter(i => i.severity === "contraindicated");
    if (contraindicated.length > 0) {
      const names = medicines.reduce((m, med) => { m[med.id] = med.name; return m; }, {} as Record<number, string>);
      const pairs = contraindicated.map(i =>
        `${names[i.medicine1Id] ?? i.medicine1Id} + ${names[i.medicine2Id] ?? i.medicine2Id}: ${i.description}`
      ).join("; ");
      res.status(400).json({ error: `Contraindicated drug combination detected — cannot dispense: ${pairs}` });
      return;
    }
  }

  // ── Safety: Allergy Check (patient must be linked) ─────────────────────────
  if (patientId) {
    const allergies = await db.select().from(patientAllergiesTable)
      .where(eq(patientAllergiesTable.patientId, patientId));
    if (allergies.length > 0) {
      const allergenNames = allergies.map(a => a.allergen.toLowerCase());
      const allergyHits = resolvedItems.filter(ri =>
        allergenNames.some(allergen =>
          ri.med.name.toLowerCase().includes(allergen) ||
          (ri.med.genericName ?? "").toLowerCase().includes(allergen) ||
          (ri.med.drugClass ?? "").toLowerCase().includes(allergen)
        )
      );
      if (allergyHits.length > 0) {
        const hitNames = allergyHits.map(ri => ri.med.name).join(", ");
        // Severity-weighted block — severe allergies are a hard block, others are warnings
        const severeHits = allergyHits.filter(ri =>
          allergies.some(a =>
            a.severity === "severe" && (
              ri.med.name.toLowerCase().includes(a.allergen.toLowerCase()) ||
              (ri.med.genericName ?? "").toLowerCase().includes(a.allergen.toLowerCase()) ||
              (ri.med.drugClass ?? "").toLowerCase().includes(a.allergen.toLowerCase())
            )
          )
        );
        if (severeHits.length > 0) {
          res.status(400).json({
            error: `ALLERGY ALERT — Patient has a recorded severe allergy to: ${hitNames}. Cannot dispense without explicit override.`,
            allergyBlock: true,
          });
          return;
        }
      }
    }
  }

  // ── Prescription enforcement — if any medicine requires a prescription, a verified
  // prescription must be attached to the order.
  const requiresRx = resolvedItems.some((ri) => ri.med.prescriptionRequired);
  // Controlled substances always require a prescription
  const hasControlled = resolvedItems.some((ri) => ri.med.controlledSchedule != null);
  if (requiresRx || hasControlled) {
    if (!prescriptionId) {
      const reason = hasControlled ? "Controlled substances require a prescription." : "One or more medicines require a prescription.";
      res.status(400).json({ error: `${reason} Please attach a verified prescription to this order.` });
      return;
    }
    const [prescription] = await db
      .select({ id: prescriptionsTable.id, status: prescriptionsTable.status, maxRefills: prescriptionsTable.maxRefills, refillsUsed: prescriptionsTable.refillsUsed })
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
    // ── Refill counter check ────────────────────────────────────────────────
    // refillsUsed counts total dispenses (first fill + refills).
    // maxRefills = 0 → dispense once; maxRefills = 3 → 4 total dispenses.
    if (prescription.refillsUsed > prescription.maxRefills) {
      res.status(400).json({
        error: `This prescription has no remaining refills (used ${prescription.refillsUsed} of ${prescription.maxRefills} allowed). Please obtain a new prescription.`,
        refillsExhausted: true,
      });
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
        sig: ri.sig ?? null,
      }).returning();
      orderItems.push({ ...oi, medicineName: ri.med.name });
      // FEFO batch deduction — draws from the earliest-expiry lots first and
      // records exactly which batches were used so cancellation can restore correctly.
      const batchAllocations = await allocateFefo(tx, ri.med.id, ri.med.name, ri.baseUnitsNeeded);
      for (const alloc of batchAllocations) {
        await tx.insert(orderItemBatchAllocationsTable).values({
          orderItemId: oi.id,
          medicineBatchId: alloc.batchId,
          quantity: alloc.quantity,
        });
      }

      // ── Controlled substance log — one immutable row per dispensing event ──
      if (ri.med.controlledSchedule) {
        await tx.insert(controlledSubstanceLogsTable).values({
          orderId: order.id,
          medicineId: ri.med.id,
          patientId: patientId ?? null,
          patientName: patientName ?? null,
          prescriptionId: prescriptionId,
          quantityDispensed: ri.baseUnitsNeeded,
          scheduleAtDispensing: ri.med.controlledSchedule,
          dispensedBy: req.auth!.userId,
        });
      }
    }

    await tx.insert(paymentsTable).values({
      orderId: order.id,
      amount: total.toFixed(2),
      method: paymentMethod,
      status: "completed",
    });

    // ── Refill counter increment ────────────────────────────────────────────
    if (prescriptionId) {
      await tx.update(prescriptionsTable)
        .set({ refillsUsed: sql`${prescriptionsTable.refillsUsed} + 1` })
        .where(eq(prescriptionsTable.id, prescriptionId));
    }

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
      sig: orderItemsTable.sig,
      returnedQuantity: orderItemsTable.returnedQuantity,
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

    // Restore stock when cancelling a dispensed order — reverse FEFO allocations
    // back to the exact batches they came from. Falls back to aggregate increment
    // for any item that pre-dates the batch system (no allocation rows).
    if (isCancelling) {
      const items = await tx
        .select()
        .from(orderItemsTable)
        .where(eq(orderItemsTable.orderId, existing.id));
      for (const item of items) {
        const allocations = await tx
          .select()
          .from(orderItemBatchAllocationsTable)
          .where(eq(orderItemBatchAllocationsTable.orderItemId, item.id));
        if (allocations.length > 0) {
          await restoreAllocations(tx, item.medicineId, allocations.map((a) => ({
            medicineBatchId: a.medicineBatchId,
            quantity: a.quantity,
          })));
        } else {
          // Legacy order (no batch allocation rows) — restore to any available batch.
          const baseUnitsToRestore = item.quantity * (item.conversionFactorToBase ?? 1);
          await restoreToAnyBatch(tx, item.medicineId, baseUnitsToRestore);
        }
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

      // Stock restoration — add back to the first available sellable batch (FEFO order).
      const baseUnitsToRestore = quantity * (item.conversionFactorToBase ?? 1);
      await restoreToAnyBatch(tx, item.medicineId, baseUnitsToRestore);

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
