import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, expensesTable, usersTable, expenseCategoryEnum } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { getDbErrorMessage } from "../lib/api-errors";
import { logAudit } from "../lib/audit";
import { z } from "zod";

const router: IRouter = Router();

const ExpenseCategoryValues = expenseCategoryEnum.enumValues;
const ExpenseMethodValues = ["cash", "bank", "cheque", "transfer", "credit"] as const;

const ExpenseBody = z.object({
  category: z.enum(ExpenseCategoryValues),
  description: z.string().min(1, "Description is required.").max(200),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "amount must be a decimal string").refine((a) => parseFloat(a) > 0, "Amount must be greater than zero."),
  method: z.enum(ExpenseMethodValues).default("cash"),
  expenseDate: z.string().optional(),
  note: z.string().max(500).nullable().optional(),
});

type ExpenseRowWithName = {
  id: number;
  category: string;
  description: string;
  amount: string | null;
  method: string;
  expenseDate: Date;
  note: string | null;
  recordedById: number;
  recordedByName: string | null;
  createdAt: Date;
  voidedAt: Date | null;
  voidReason: string | null;
};

// GET /expenses — full list (voided entries kept for the audit trail) plus a
// summary of non-voided spending. Admin only, like the supplier ledger.
router.get(
  "/expenses",
  requireAuth,
  requireRole("admin"),
  async (_req, res): Promise<void> => {
    try {
      const rows = await db
        .select({
          id: expensesTable.id,
          category: expensesTable.category,
          description: expensesTable.description,
          amount: expensesTable.amount,
          method: expensesTable.method,
          expenseDate: expensesTable.expenseDate,
          note: expensesTable.note,
          recordedBy: expensesTable.recordedBy,
          recordedByName: usersTable.name,
          createdAt: expensesTable.createdAt,
          voidedAt: expensesTable.voidedAt,
          voidReason: expensesTable.voidReason,
        })
        .from(expensesTable)
        .leftJoin(usersTable, eq(usersTable.id, expensesTable.recordedBy))
        .orderBy(desc(expensesTable.expenseDate), desc(expensesTable.id));

      const active = rows.filter((r) => !r.voidedAt);
      const total = active.reduce((sum, r) => sum + parseFloat(r.amount ?? "0"), 0);
      const now = new Date();
      const thisMonthTotal = active
        .filter((r) => {
          const d = new Date(r.expenseDate);
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        })
        .reduce((sum, r) => sum + parseFloat(r.amount ?? "0"), 0);

      const byCategory: Record<string, string> = {};
      for (const category of ExpenseCategoryValues) {
        byCategory[category] = active
          .filter((r) => r.category === category)
          .reduce((sum, r) => sum + parseFloat(r.amount ?? "0"), 0)
          .toFixed(2);
      }

      const entries: ExpenseRowWithName[] = rows.map((r) => ({
        id: r.id,
        category: r.category,
        description: r.description,
        amount: r.amount ? parseFloat(r.amount).toFixed(2) : "0.00",
        method: r.method,
        expenseDate: r.expenseDate,
        note: r.note,
        recordedById: r.recordedBy,
        recordedByName: r.recordedByName,
        createdAt: r.createdAt,
        voided: Boolean(r.voidedAt),
        voidedAt: r.voidedAt,
        voidReason: r.voidReason,
      }));

      res.json({
        entries,
        summary: {
          total: total.toFixed(2),
          thisMonth: thisMonthTotal.toFixed(2),
          byCategory,
        },
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to load expenses.", detail: getDbErrorMessage(err) });
    }
  }
);

// POST /expenses — record a business expense.
router.post(
  "/expenses",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const parsed = ExpenseBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { category, description, amount, method, expenseDate, note } = parsed.data;

    let date: Date | undefined;
    if (expenseDate) {
      date = new Date(expenseDate);
      if (isNaN(date.getTime())) {
        res.status(400).json({ error: "expenseDate must be a valid date." });
        return;
      }
    }

    try {
      const [expense] = await db
        .insert(expensesTable)
        .values({
          category,
          description,
          amount,
          method,
          expenseDate: date,
          note: note ?? null,
          recordedBy: req.auth!.userId,
        })
        .returning();

      const [user] = await db
        .select({ name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, req.auth!.userId));

      res.status(201).json({
        id: expense.id,
        category: expense.category,
        description: expense.description,
        amount: parseFloat(expense.amount ?? "0").toFixed(2),
        method: expense.method,
        expenseDate: expense.expenseDate,
        note: expense.note,
        recordedById: expense.recordedBy,
        recordedByName: user?.name ?? null,
        createdAt: expense.createdAt,
        voided: false,
        voidReason: null,
      });

      await logAudit(
        req.auth!.userId,
        "expense",
        "expense",
        expense.id,
        `Recorded a ${category} expense of ${amount} (${method})${note ? ` — ${note}` : ""}.`
      );
    } catch (err) {
      res.status(500).json({ error: "Failed to record expense.", detail: getDbErrorMessage(err) });
    }
  }
);

const VoidExpenseBody = z.object({
  reason: z.string().min(1, "A void reason is required.").max(500),
});

// PATCH /expenses/:id/void — mark a mistakenly-recorded expense as voided.
// Voided expenses are excluded from the summary totals so the wrong entry no
// longer affects spending figures (reversal-by-void, admin only).
router.patch(
  "/expenses/:id/void",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const expenseId = parseInt(String(req.params.id), 10);
    if (isNaN(expenseId)) {
      res.status(400).json({ error: "Invalid expense ID" });
      return;
    }
    const parsed = VoidExpenseBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    try {
      const [expense] = await db
        .select({
          id: expensesTable.id,
          category: expensesTable.category,
          amount: expensesTable.amount,
          method: expensesTable.method,
          voidedAt: expensesTable.voidedAt,
        })
        .from(expensesTable)
        .where(eq(expensesTable.id, expenseId));

      if (!expense) {
        res.status(404).json({ error: "Expense not found" });
        return;
      }
      if (expense.voidedAt) {
        res.status(409).json({ error: "This expense is already voided." });
        return;
      }

      const now = new Date();
      await db
        .update(expensesTable)
        .set({ voidedAt: now, voidReason: parsed.data.reason })
        .where(eq(expensesTable.id, expenseId));

      await logAudit(
        req.auth!.userId,
        "expense.void",
        "expense",
        expenseId,
        `Voided a ${expense.category} expense of ${expense.amount} (reason: ${parsed.data.reason}). The expenses ledger total was corrected.`
      );

      res.json({ id: expenseId, voidedAt: now.toISOString(), voidReason: parsed.data.reason });
    } catch (err) {
      res.status(500).json({ error: "Failed to void expense.", detail: getDbErrorMessage(err) });
    }
  }
);

export default router;