import { pgTable, serial, timestamp, integer, numeric, text, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const expenseCategoryEnum = pgEnum("expense_category", [
  "rent",
  "utilities",
  "salaries",
  "supplies",
  "maintenance",
  "marketing",
  "transport",
  "insurance",
  "miscellaneous",
]);

export const expensePaymentMethodEnum = pgEnum("expense_payment_method", ["cash", "bank", "cheque", "transfer", "credit"]);

export const expensesTable = pgTable("expenses", {
  id: serial("id").primaryKey(),
  category: expenseCategoryEnum("category").notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  method: expensePaymentMethodEnum("method").notNull().default("cash"),
  expenseDate: timestamp("expense_date", { withTimezone: true }).notNull().defaultNow(),
  note: text("note"),
  // Who recorded the expense. Kept as an Integer reference by design so the
  // API can join in the user's name for display without trusting client input.
  recordedBy: integer("recorded_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Set when an expense was recorded by mistake and later voided. Voided
  // expenses are excluded from the ledger summary so the wrong entry no
  // longer affects totals (reversal-by-void).
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidReason: text("void_reason"),
});

export const insertExpenseSchema = createInsertSchema(expensesTable).omit({ id: true, createdAt: true, voidedAt: true, voidReason: true });
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type ExpenseRow = typeof expensesTable.$inferSelect;