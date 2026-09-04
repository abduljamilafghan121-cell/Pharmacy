import { Router, type IRouter } from "express";
import { eq, and, desc, isNull } from "drizzle-orm";
import {
  db,
  suppliersTable,
  purchaseOrdersTable,
  supplierPaymentsTable,
} from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { getDbErrorMessage } from "../lib/api-errors";
import { logAudit } from "../lib/audit";
import { z } from "zod";

const router: IRouter = Router();

const SupplierPaymentBody = z.object({
  supplierId: z.number().int().positive(),
  purchaseOrderId: z.number().int().positive().nullable().optional(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "amount must be a decimal string"),
  method: z.enum(["cash", "bank", "cheque", "transfer"]),
  note: z.string().nullable().optional(),
});

// GET /supplier-ledger — all suppliers with running balance
router.get(
  "/supplier-ledger",
  requireAuth,
  requireRole("admin"),
  async (_req, res): Promise<void> => {
    const suppliers = await db.select().from(suppliersTable).orderBy(suppliersTable.name);

    const summaries = await Promise.all(
      suppliers.map(async (s) => {
        const pos = await db
          .select({ total: purchaseOrdersTable.total })
          .from(purchaseOrdersTable)
          .where(eq(purchaseOrdersTable.supplierId, s.id));

        const payments = await db
          .select({ amount: supplierPaymentsTable.amount, createdAt: supplierPaymentsTable.createdAt, voidedAt: supplierPaymentsTable.voidedAt })
          .from(supplierPaymentsTable)
          .where(eq(supplierPaymentsTable.supplierId, s.id));

        const totalOrdered = pos.reduce((sum, p) => sum + parseFloat(p.total ?? "0"), 0);
        // Voided payments are excluded so a mistaken entry no longer affects the balance.
        const totalPaid = payments
          .filter((p) => !p.voidedAt)
          .reduce((sum, p) => sum + parseFloat(p.amount ?? "0"), 0);
        const balance = totalOrdered - totalPaid;

        const lastPaymentAt = payments
          .filter((p) => !p.voidedAt)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]?.createdAt ?? null;

        return {
          supplierId: s.id,
          supplierName: s.name,
          totalOrdered: totalOrdered.toFixed(2),
          totalPaid: totalPaid.toFixed(2),
          balance: balance.toFixed(2),
          lastActivity: lastPaymentAt ?? null,
        };
      })
    );

    res.json(summaries);
  }
);

// GET /supplier-ledger/:supplierId — detailed ledger with all entries
router.get(
  "/supplier-ledger/:supplierId",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const supplierId = parseInt(String(req.params.supplierId), 10);
    if (isNaN(supplierId)) {
      res.status(400).json({ error: "Invalid supplier ID" });
      return;
    }

    const [supplier] = await db
      .select()
      .from(suppliersTable)
      .where(eq(suppliersTable.id, supplierId));

    if (!supplier) {
      res.status(404).json({ error: "Supplier not found" });
      return;
    }

    const pos = await db
      .select({
        id: purchaseOrdersTable.id,
        total: purchaseOrdersTable.total,
        status: purchaseOrdersTable.status,
        createdAt: purchaseOrdersTable.createdAt,
      })
      .from(purchaseOrdersTable)
      .where(eq(purchaseOrdersTable.supplierId, supplierId));

    const payments = await db
      .select()
      .from(supplierPaymentsTable)
      .where(eq(supplierPaymentsTable.supplierId, supplierId))
      .orderBy(desc(supplierPaymentsTable.createdAt));

    // Build chronological ledger entries
    type Entry = {
      id: number;
      entryType: "purchase_order" | "payment";
      purchaseOrderId: number | null;
      paymentId: number | null;
      date: Date;
      description: string;
      debit: number;
      credit: number;
      voided: boolean;
      voidReason: string | null;
      method: string | null;
      note: string | null;
    };

    const entries: Entry[] = [
      ...pos.map((po) => ({
        id: po.id,
        entryType: "purchase_order" as const,
        purchaseOrderId: po.id,
        paymentId: null,
        date: new Date(po.createdAt),
        description: `Purchase Order #${po.id} (${po.status})`,
        debit: parseFloat(po.total ?? "0"),
        credit: 0,
        voided: false,
        voidReason: null,
        method: null,
        note: null,
      })),
      ...payments.map((p) => ({
        id: p.id,
        entryType: "payment" as const,
        purchaseOrderId: p.purchaseOrderId ?? null,
        paymentId: p.id,
        date: new Date(p.createdAt),
        description: `Payment – ${p.method}${p.note ? `: ${p.note}` : ""}`,
        debit: 0,
        credit: p.voidedAt ? 0 : parseFloat(p.amount ?? "0"),
        voided: Boolean(p.voidedAt),
        voidReason: p.voidReason ?? null,
        method: p.method,
        note: p.note,
      })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    // Compute running balance (voided payments contribute nothing)
    let running = 0;
    const enriched = entries.map((e) => {
      running += e.debit - e.credit;
      return {
        id: e.id,
        entryType: e.entryType,
        purchaseOrderId: e.purchaseOrderId,
        paymentId: e.paymentId,
        date: e.date.toISOString(),
        description: e.description,
        debit: e.debit.toFixed(2),
        credit: e.credit.toFixed(2),
        runningBalance: running.toFixed(2),
        voided: e.voided,
        voidReason: e.voidReason,
        method: e.method,
        note: e.note,
      };
    });

    const totalOrdered = pos.reduce((sum, p) => sum + parseFloat(p.total ?? "0"), 0);
    const totalPaid = payments
      .filter((p) => !p.voidedAt)
      .reduce((sum, p) => sum + parseFloat(p.amount ?? "0"), 0);

    res.json({
      supplierId: supplier.id,
      supplierName: supplier.name,
      contactName: supplier.contactName ?? null,
      email: supplier.email ?? null,
      phone: supplier.phone ?? null,
      totalOrdered: totalOrdered.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
      balance: (totalOrdered - totalPaid).toFixed(2),
      entries: enriched,
    });
  }
);

// POST /supplier-payments — record a payment to a supplier
router.post(
  "/supplier-payments",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const parsed = SupplierPaymentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { supplierId, purchaseOrderId, amount, method, note } = parsed.data;

    const [supplier] = await db
      .select({ id: suppliersTable.id, name: suppliersTable.name })
      .from(suppliersTable)
      .where(eq(suppliersTable.id, supplierId));

    if (!supplier) {
      res.status(404).json({ error: "Supplier not found" });
      return;
    }

    const [payment] = await db
      .insert(supplierPaymentsTable)
      .values({
        supplierId,
        purchaseOrderId: purchaseOrderId ?? null,
        amount,
        method,
        note: note ?? null,
      })
      .returning();

    res.status(201).json({
      id: payment.id,
      supplierId: payment.supplierId,
      supplierName: supplier.name,
      purchaseOrderId: payment.purchaseOrderId,
      amount: payment.amount,
      method: payment.method,
      note: payment.note,
      createdAt: payment.createdAt,
    });

    await logAudit(
      req.auth!.userId,
      "payment",
      "purchase_order",
      payment.purchaseOrderId ?? payment.id,
      `Recorded a ${method} payment of ${amount} to ${supplier.name}${note ? ` — ${note}` : ""}.`
    );
  }
);

const VoidPaymentBody = z.object({
  reason: z.string().min(1, "A void reason is required.").max(500),
});

// PATCH /supplier-payments/:id/void — mark a mistakenly-recorded payment as
// voided. Voided payments are excluded from the ledger balance, so the wrong
// entry no longer affects what we owe (reversal-by-void, admin only).
router.patch(
  "/supplier-payments/:id/void",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const paymentId = parseInt(String(req.params.id), 10);
    if (isNaN(paymentId)) {
      res.status(400).json({ error: "Invalid payment ID" });
      return;
    }
    const parsed = VoidPaymentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    try {
      const [payment] = await db
        .select({
          id: supplierPaymentsTable.id,
          supplierId: supplierPaymentsTable.supplierId,
          amount: supplierPaymentsTable.amount,
          method: supplierPaymentsTable.method,
          voidedAt: supplierPaymentsTable.voidedAt,
        })
        .from(supplierPaymentsTable)
        .where(eq(supplierPaymentsTable.id, paymentId));

      if (!payment) {
        res.status(404).json({ error: "Payment not found" });
        return;
      }
      if (payment.voidedAt) {
        res.status(409).json({ error: "This payment is already voided." });
        return;
      }

      const now = new Date();
      await db
        .update(supplierPaymentsTable)
        .set({ voidedAt: now, voidReason: parsed.data.reason })
        .where(eq(supplierPaymentsTable.id, paymentId));

      await logAudit(
        req.auth!.userId,
        "payment.void",
        "supplier_payment",
        paymentId,
        `Voided a ${payment.method} payment of ${payment.amount} (reason: ${parsed.data.reason}). The supplier ledger balance was corrected.`
      );

      res.json({ id: paymentId, voidedAt: now.toISOString(), voidReason: parsed.data.reason });
    } catch (err) {
      res.status(500).json({ error: "Failed to void payment.", detail: getDbErrorMessage(err) });
    }
  }
);

export default router;
