import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, paymentsTable, ordersTable } from "@workspace/db";
import { CreatePaymentBody, GetPaymentParams } from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.post("/payments", requireAuth, requireRole("admin", "pharmacist", "cashier"), async (req, res): Promise<void> => {
  const parsed = CreatePaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, parsed.data.orderId));
  if (!order) {
    res.status(404).json({ error: "Order not found." });
    return;
  }
  if (order.paymentStatus === "paid") {
    res.status(409).json({ error: "This order is already fully paid." });
    return;
  }
  const amount = parseFloat(parsed.data.amount);
  if (!(amount > 0)) {
    res.status(400).json({ error: "Payment amount must be greater than zero." });
    return;
  }
  // Small epsilon guards against floating point rounding on the total.
  if (amount > parseFloat(order.total) + 0.01) {
    res.status(400).json({ error: `Payment of ${parsed.data.amount} exceeds the order total of ${order.total}.` });
    return;
  }

  // status is not part of the public PaymentInput schema; always complete on creation
  const status = "completed" as const;
  const transactionId = parsed.data.transactionId ?? null;

  const [payment] = await db.insert(paymentsTable).values({
    orderId: parsed.data.orderId,
    amount: parsed.data.amount,
    method: parsed.data.method,
    status,
    transactionId,
  }).returning();

  // Only mark the order as paid when the payment actually completed
  if (status === "completed") {
    await db.update(ordersTable).set({ paymentStatus: "paid" }).where(eq(ordersTable.id, parsed.data.orderId));
  }

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
