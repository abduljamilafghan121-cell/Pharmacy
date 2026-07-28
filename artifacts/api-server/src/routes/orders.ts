import { Router, type IRouter } from "express";
import { eq, sql, inArray, and, desc } from "drizzle-orm";
import {
  db, ordersTable, orderItemsTable, medicinesTable, usersTable, paymentsTable,
  medicineUnitsTable, prescriptionsTable, orderItemBatchAllocationsTable,
  pharmacySettingsTable, orderItemReturnsTable,
} from "@workspace/db";
import { z } from "zod";
import {
  CreateOrderBody, UpdateOrderStatusBody,
  GetOrderParams, UpdateOrderStatusParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { getDbErrorMessage } from "../lib/api-errors";
import { allocateFefo, restoreAllocations, InsufficientStockError } from "../lib/batch-helpers";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

const ORDER_SELECT = {
  id: ordersTable.id,
  patientId: ordersTable.patientId,
  patientName: ordersTable.patientName,
  prescriptionId: ordersTable.prescriptionId,
  servedByName: usersTable.name,
  status: ordersTable.status,
  subtotal: ordersTable.subtotal,
  discountAmount: ordersTable.discountAmount,
  taxAmount: ordersTable.taxAmount,
  total: ordersTable.total,
  paymentStatus: ordersTable.paymentStatus,
  notes: ordersTable.notes,
  createdAt: ordersTable.createdAt,
};

router.get("/orders", requireAuth, async (req, res): Promise<void> => {
  const limit = Math.min(Math.max(Number(req.query["limit"]) || 500, 1), 1000);
  const offset = Math.max(Number(req.query["offset"]) || 0, 0);
  const rows = await db
    .select(ORDER_SELECT)
    .from(ordersTable)
    .leftJoin(usersTable, eq(ordersTable.servedBy, usersTable.id))
    .orderBy(sql`${ordersTable.createdAt} DESC`)
    .limit(limit)
    .offset(offset);
  res.json(rows);
});

// Extended item input: standard fields + optional unitId
const OrderItemInputExtended = z.object({
  medicineId: z.number().int().positive(),
  quantity: z.number().int().min(1),
  unitId: z.number().int().positive().optional(),
});

router.post("/orders", requireAuth, requireRole("admin", "pharmacist", "cashier"), async (req, res): Promise<void> => {
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
  // prescriptionId and discountAmount aren't in the generated CreateOrderBody
  // yet — accept them as optional extra fields without needing a codegen regen.
  const extraBody = req.body as Record<string, unknown>;
  const prescriptionIdRaw = extraBody.prescriptionId;
  const prescriptionId =
    typeof prescriptionIdRaw === "number" || typeof prescriptionIdRaw === "string"
      ? Number(prescriptionIdRaw)
      : undefined;
  const discountAmountRaw = extraBody.discountAmount;
  const requestedDiscount = typeof discountAmountRaw === "number" || typeof discountAmountRaw === "string"
    ? Math.max(0, Number(discountAmountRaw) || 0)
    : 0;

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
    // No separate "expired" check needed here: medicines.quantity/expiryDate
    // are derived only from SELLABLE (non-expired) batches (see
    // refreshMedicineAggregate), and allocateFefo below only ever draws
    // from non-expired batches too — so an expired-but-unsold batch simply
    // doesn't count as available stock, without blocking a sale of the
    // same medicine if a fresher batch exists behind it.
  }

  // ── Prescription enforcement ──────────────────────────────────────────
  // Any Rx-only medicine in the cart requires a prescriptionId pointing at
  // a prescription that has actually been verified by a pharmacist.
  const rxItems = resolvedItems.filter((ri) => ri.med.prescriptionRequired);
  if (rxItems.length > 0) {
    if (!prescriptionId) {
      res.status(400).json({
        error: `A verified prescription is required to sell: ${rxItems.map((r) => r.med.name).join(", ")}.`,
      });
      return;
    }
    const [prescription] = await db.select().from(prescriptionsTable).where(eq(prescriptionsTable.id, prescriptionId));
    if (!prescription) {
      res.status(400).json({ error: "The selected prescription could not be found." });
      return;
    }
    if (prescription.status !== "verified") {
      res.status(400).json({ error: `The selected prescription is ${prescription.status}, not verified. It must be verified before dispensing.` });
      return;
    }
  }

  // Compute totals — price per base unit × base units needed
  let subtotal = 0;
  for (const ri of resolvedItems) {
    subtotal += parseFloat(ri.med.price) * ri.baseUnitsNeeded;
  }

  const discountAmount = Math.min(requestedDiscount, subtotal); // never discount below $0
  if (requestedDiscount > subtotal) {
    res.status(400).json({ error: "Discount cannot exceed the order subtotal." });
    return;
  }

  const [pharmacySettings] = await db.select({ taxRatePercent: pharmacySettingsTable.taxRatePercent }).from(pharmacySettingsTable);
  const taxRate = parseFloat(pharmacySettings?.taxRatePercent ?? "0");
  const taxableAmount = subtotal - discountAmount;
  const taxAmount = taxableAmount * (taxRate / 100);
  const total = taxableAmount + taxAmount;

  try {
    // Run order creation, stock decrement, and payment inside a single transaction
    const { order, orderItems, staffName } = await db.transaction(async (tx) => {
      const [order] = await tx.insert(ordersTable).values({
        patientId: patientId ?? null,
        patientName: patientName ?? null,
        prescriptionId: prescriptionId ?? null,
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

        // FEFO: draws from the medicine's oldest-expiring batches first,
        // possibly spanning several batches. Race-safe (atomic per-batch
        // decrement) and throws InsufficientStockError if the batches
        // don't actually have enough combined stock.
        const allocations = await allocateFefo(tx, ri.med.id, ri.med.name, ri.baseUnitsNeeded);
        for (const alloc of allocations) {
          await tx.insert(orderItemBatchAllocationsTable).values({
            orderItemId: oi.id,
            medicineBatchId: alloc.batchId,
            quantity: alloc.quantity,
          });
        }
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
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      res.status(409).json({ error: `${err.medicineName} just went out of stock — please review the cart and try again.` });
      return;
    }
    res.status(500).json({ error: "Failed to process sale.", detail: getDbErrorMessage(err) });
  }
});

router.get("/orders/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [order] = await db
    .select(ORDER_SELECT)
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
      returnedQuantity: orderItemsTable.returnedQuantity,
      prescriptionRequired: medicinesTable.prescriptionRequired,
    })
    .from(orderItemsTable)
    .leftJoin(medicinesTable, eq(orderItemsTable.medicineId, medicinesTable.id))
    .where(eq(orderItemsTable.orderId, params.data.id));

  res.json({ ...order, items });
});

router.patch("/orders/:id/status", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
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

  try {
    const row = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, params.data.id));
      if (!existing) return null;

      const isCancelling = parsed.data.status === "cancelled" && existing.status === "dispensed";

      // Restore stock when cancelling a dispensed order — restores into the
      // EXACT batches it was drawn from (via the recorded allocations),
      // so distinct expiry dates don't get merged back together.
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
            await restoreAllocations(
              tx,
              item.medicineId,
              allocations.map((a) => ({ medicineBatchId: a.medicineBatchId, quantity: a.quantity }))
            );
          }
        }
      }

      // Build order update payload
      const orderUpdates: Record<string, unknown> = { status: parsed.data.status };
      if (isCancelling && refundNote) {
        const existingNotes = existing.notes ? `${existing.notes}\n` : "";
        orderUpdates.notes = `${existingNotes}Refund reason: ${refundNote}`;
      }
      // Bug fix: this used to only fake `paymentStatus: "refunded"` in the
      // HTTP response without persisting it — reloading the order would
      // still show "paid". Now it's actually written to the row.
      if (isCancelling && existing.paymentStatus === "paid") {
        orderUpdates.paymentStatus = "refunded";
      }

      const [updated] = await tx
        .update(ordersTable)
        .set(orderUpdates)
        .where(eq(ordersTable.id, params.data.id))
        .returning();

      if (isCancelling && existing.paymentStatus === "paid") {
        await tx
          .update(paymentsTable)
          .set({ status: "refunded" })
          .where(eq(paymentsTable.orderId, existing.id));
      }

      return updated;
    });

    if (!row) { res.status(404).json({ error: "Sale not found" }); return; }
    res.json({ ...row, servedByName: null });
    logAudit(req.auth!.userId, `order.${row.status}`, "order", row.id,
      `Marked sale #${row.id} as ${row.status}${row.paymentStatus === "refunded" ? " and refunded payment" : ""}${refundNote ? ` — reason: ${refundNote}` : ""}.`);
  } catch (err) {
    res.status(500).json({ error: "Failed to update sale status.", detail: getDbErrorMessage(err) });
  }
});

const ReturnItemBody = z.object({
  quantity: z.number().int().min(1),
  reason: z.string().min(1),
});

// Customer return of PART of a sale (e.g. "brought back 3 of the 10
// tablets") — distinct from cancelling the whole order. Restores stock to
// the exact batch(es) it was drawn from, working backward through the
// original allocations (most-recently-allocated batch first), and records
// the return with a proportional refund amount.
router.post("/orders/:id/items/:itemId/return", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const orderId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  if (!Number.isInteger(orderId) || !Number.isInteger(itemId)) {
    res.status(400).json({ error: "Invalid order or item id." });
    return;
  }
  const parsed = ReturnItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, orderId));
      if (!order) return { error: "Sale not found." as const };
      if (order.status === "cancelled") return { error: "This sale was already cancelled — nothing to return." as const };

      const [item] = await tx.select().from(orderItemsTable).where(and(eq(orderItemsTable.id, itemId), eq(orderItemsTable.orderId, orderId)));
      if (!item) return { error: "Item not found on this sale." as const };

      const remainingReturnable = item.quantity - item.returnedQuantity;
      if (parsed.data.quantity > remainingReturnable) {
        return { error: `Only ${remainingReturnable} unit(s) of this item are eligible for return.` as const };
      }

      const conversionFactor = item.conversionFactorToBase ?? 1;
      const baseUnitsToReturn = parsed.data.quantity * conversionFactor;

      // Restore into the batches this item was originally drawn from,
      // working backward (last-allocated batch first) until the returned
      // quantity is accounted for.
      const allocations = await tx
        .select()
        .from(orderItemBatchAllocationsTable)
        .where(eq(orderItemBatchAllocationsTable.orderItemId, itemId))
        .orderBy(desc(orderItemBatchAllocationsTable.id));

      let remaining = baseUnitsToReturn;
      const toRestore: { medicineBatchId: number; quantity: number }[] = [];
      for (const alloc of allocations) {
        if (remaining <= 0) break;
        const take = Math.min(alloc.quantity, remaining);
        toRestore.push({ medicineBatchId: alloc.medicineBatchId, quantity: take });
        remaining -= take;
      }
      if (toRestore.length > 0) {
        await restoreAllocations(tx, item.medicineId, toRestore);
      }

      // Proportional refund: this item's unit price × quantity returned,
      // plus a proportional share of the order's tax. Discount is not
      // separately un-applied — it's already baked into what the customer
      // paid, so refunding the line price as-charged is correct.
      const lineUnitPrice = parseFloat(item.price) / item.quantity;
      const refundBase = lineUnitPrice * parsed.data.quantity;
      const orderTaxableBase = parseFloat(order.subtotal) - parseFloat(order.discountAmount);
      const taxProportion = orderTaxableBase > 0 ? parseFloat(order.taxAmount) * (refundBase / orderTaxableBase) : 0;
      const refundAmount = refundBase + taxProportion;

      await tx.insert(orderItemReturnsTable).values({
        orderItemId: itemId,
        quantity: parsed.data.quantity,
        reason: parsed.data.reason,
        refundAmount: refundAmount.toFixed(2),
        processedBy: req.auth!.userId,
      });

      await tx.update(orderItemsTable)
        .set({ returnedQuantity: item.returnedQuantity + parsed.data.quantity })
        .where(eq(orderItemsTable.id, itemId));

      const newTotal = Math.max(0, parseFloat(order.total) - refundAmount);
      await tx.update(ordersTable).set({ total: newTotal.toFixed(2) }).where(eq(ordersTable.id, orderId));

      const [medicine] = await tx.select({ name: medicinesTable.name }).from(medicinesTable).where(eq(medicinesTable.id, item.medicineId));

      return { refundAmount, newTotal, medicineName: medicine?.name ?? "item", quantity: parsed.data.quantity };
    });

    if ("error" in result) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ message: "Return processed.", refundAmount: result.refundAmount.toFixed(2), newTotal: result.newTotal.toFixed(2) });
    logAudit(req.auth!.userId, "order.item_return", "order", orderId,
      `Returned ${result.quantity} unit(s) of "${result.medicineName}" from sale #${orderId} — refunded ${result.refundAmount.toFixed(2)}. Reason: ${parsed.data.reason}.`);
  } catch (err) {
    res.status(500).json({ error: "Failed to process return.", detail: getDbErrorMessage(err) });
  }
});

export default router;
