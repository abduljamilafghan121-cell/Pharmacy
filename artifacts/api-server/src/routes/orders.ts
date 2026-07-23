import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, medicinesTable, usersTable } from "@workspace/db";
import {
  CreateOrderBody, UpdateOrderStatusBody,
  GetOrderParams, UpdateOrderStatusParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/orders", requireAuth, async (req, res): Promise<void> => {
  const { role, userId } = req.auth!;
  const rows = await db
    .select({
      id: ordersTable.id,
      customerId: ordersTable.customerId,
      customerName: usersTable.name,
      prescriptionId: ordersTable.prescriptionId,
      status: ordersTable.status,
      subtotal: ordersTable.subtotal,
      total: ordersTable.total,
      paymentStatus: ordersTable.paymentStatus,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .leftJoin(usersTable, eq(ordersTable.customerId, usersTable.id))
    .where(role === "customer" ? eq(ordersTable.customerId, userId) : undefined)
    .orderBy(sql`${ordersTable.createdAt} DESC`);
  res.json(rows);
});

router.post("/orders", requireAuth, requireRole("customer"), async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { items, prescriptionId } = parsed.data;

  // Fetch all medicines
  const medicineIds = items.map((i) => i.medicineId);
  const medicines = await db.select().from(medicinesTable).where(
    sql`${medicinesTable.id} = ANY(${medicineIds})`
  );

  // Validate stock and prescription requirement
  for (const item of items) {
    const med = medicines.find((m) => m.id === item.medicineId);
    if (!med) {
      res.status(400).json({ error: `Medicine ${item.medicineId} not found` });
      return;
    }
    if (med.quantity < item.quantity) {
      res.status(400).json({ error: `Insufficient stock for ${med.name}` });
      return;
    }
    if (med.prescriptionRequired && !prescriptionId) {
      res.status(400).json({ error: `${med.name} requires a verified prescription` });
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
    customerId: req.auth!.userId,
    prescriptionId: prescriptionId ?? null,
    subtotal: subtotal.toFixed(2),
    total: total.toFixed(2),
  }).returning();

  // Create items and decrement stock
  const orderItems = [];
  for (const item of items) {
    const med = medicines.find((m) => m.id === item.medicineId)!;
    const [oi] = await db.insert(orderItemsTable).values({
      orderId: order.id,
      medicineId: item.medicineId,
      quantity: item.quantity,
      price: (parseFloat(med.price) * item.quantity).toFixed(2),
    }).returning();
    orderItems.push({ ...oi, medicineName: med.name });
    await db.update(medicinesTable).set({ quantity: med.quantity - item.quantity }).where(eq(medicinesTable.id, med.id));
  }

  res.status(201).json({ ...order, customerName: null, items: orderItems });
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
      customerId: ordersTable.customerId,
      customerName: usersTable.name,
      prescriptionId: ordersTable.prescriptionId,
      status: ordersTable.status,
      subtotal: ordersTable.subtotal,
      total: ordersTable.total,
      paymentStatus: ordersTable.paymentStatus,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .leftJoin(usersTable, eq(ordersTable.customerId, usersTable.id))
    .where(eq(ordersTable.id, params.data.id));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

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
  const [row] = await db
    .update(ordersTable).set({ status: parsed.data.status })
    .where(eq(ordersTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Order not found" }); return; }
  res.json({ ...row, customerName: null });
});

export default router;
