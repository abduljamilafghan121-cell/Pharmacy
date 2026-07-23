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

  // Simulate payment processing (mock/sandbox)
  const transactionId = parsed.data.transactionId ?? `TXN-${Date.now()}`;
  const [payment] = await db.insert(paymentsTable).values({
    orderId: parsed.data.orderId,
    amount: parsed.data.amount,
    method: parsed.data.method,
    status: "completed",
    transactionId,
  }).returning();

  // Update order payment status
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
