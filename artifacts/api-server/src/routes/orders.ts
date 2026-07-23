import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, medicinesTable, usersTable, paymentsTable } from "@workspace/db";
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

router.post("/orders", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { items, patientId, patientName, paymentMethod, notes } = parsed.data;

  // Fetch all medicines
  const medicineIds = items.map((i: { medicineId: number; quantity: number }) => i.medicineId);
  const medicines = await db.select().from(medicinesTable).where(
    sql`${medicinesTable.id} = ANY(${medicineIds})`
  );

  // Validate stock
  for (const item of items) {
    const med = medicines.find((m) => m.id === item.medicineId);
    if (!med) {
      res.status(400).json({ error: `Medicine ${item.medicineId} not found` });
      return;
    }
    if (med.quantity < item.quantity) {
      res.status(400).json({ error: `Insufficient stock for ${med.name} (available: ${med.quantity})` });
      return;
    }
  }

  // Compute totals
  let subtotal = 0;
  for (const item of items) {
    const med = medicines.find((m) => m.id === item.medicineId)!;
    subtotal += parseFloat(med.price) * item.quantity;
  }
  const total = subtotal;

  // Create order
  const [order] = await db.insert(ordersTable).values({
    patientId: patientId ?? null,
    patientName: patientName ?? null,
    servedBy: req.auth!.userId,
    subtotal: subtotal.toFixed(2),
    total: total.toFixed(2),
    status: "dispensed",
    paymentStatus: "paid",
    notes: notes ?? null,
  }).returning();

  // Create items and decrement stock
  const orderItems = [];
  for (const item of items) {
    const med = medicines.find((m) => m.id === item.medicineId)!;
    const unitPrice = parseFloat(med.price);
    const [oi] = await db.insert(orderItemsTable).values({
      orderId: order.id,
      medicineId: item.medicineId,
      quantity: item.quantity,
      price: (unitPrice * item.quantity).toFixed(2),
    }).returning();
    orderItems.push({ ...oi, medicineName: med.name });
    await db.update(medicinesTable)
      .set({ quantity: med.quantity - item.quantity })
      .where(eq(medicinesTable.id, med.id));
  }

  // Create payment record
  await db.insert(paymentsTable).values({
    orderId: order.id,
    amount: total.toFixed(2),
    method: paymentMethod,
    status: "completed",
  });

  // Fetch servedBy name
  const [staff] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, req.auth!.userId));

  res.status(201).json({ ...order, servedByName: staff?.name ?? null, items: orderItems });
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
  const [row] = await db
    .update(ordersTable).set({ status: parsed.data.status })
    .where(eq(ordersTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Sale not found" }); return; }
  res.json({ ...row, servedByName: null });
});

export default router;
