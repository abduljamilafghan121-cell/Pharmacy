import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, paymentsTable, ordersTable } from "@workspace/db";
import { CreatePaymentBody, GetPaymentParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.post("/payments", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreatePaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Validate the order exists, is not already paid, and the amount matches
  const [order] = await db
    .select({ id: ordersTable.id, total: ordersTable.total, paymentStatus: ordersTable.paymentStatus })
    .from(ordersTable)
    .where(eq(ordersTable.id, parsed.data.orderId));

  if (!order) {
    res.status(404).json({ error: "Order not found." });
    return;
  }
  if (order.paymentStatus === "paid") {
    res.status(409).json({ error: "This order is already paid." });
    return;
  }
  const orderTotal = parseFloat(order.total);
  const paymentAmount = parseFloat(parsed.data.amount);
  if (Math.abs(paymentAmount - orderTotal) > 0.01) {
    res.status(400).json({
      error: `Payment amount (${paymentAmount.toFixed(2)}) does not match order total (${orderTotal.toFixed(2)}).`,
    });
    return;
  }

  const status = "completed" as const;
  const transactionId = parsed.data.transactionId ?? null;

  const [payment] = await db.insert(paymentsTable).values({
    orderId: parsed.data.orderId,
    amount: parsed.data.amount,
    method: parsed.data.method,
    status,
    transactionId,
  }).returning();

  await db.update(ordersTable).set({ paymentStatus: "paid" }).where(eq(ordersTable.id, parsed.data.orderId));

  res.status(201).json(payment);
});

router.get("/payments/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetPaymentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Payment not found" }); return; }
  res.json(row);
});

export default router;
