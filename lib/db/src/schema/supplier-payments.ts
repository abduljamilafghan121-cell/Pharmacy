import { pgTable, serial, timestamp, integer, numeric, text, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { suppliersTable } from "./suppliers";
import { purchaseOrdersTable } from "./purchase-orders";

export const supplierPaymentMethodEnum = pgEnum("supplier_payment_method", ["cash", "bank", "cheque", "transfer", "credit"]);

export const supplierPaymentsTable = pgTable("supplier_payments", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id),
  purchaseOrderId: integer("purchase_order_id").references(() => purchaseOrdersTable.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  method: supplierPaymentMethodEnum("method").notNull().default("cash"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Set when this payment was recorded by mistake and later voided. Voided
  // payments are excluded from the supplier ledger balance so the wrong
  // entry no longer affects the running total (reversal-by-void).
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidReason: text("void_reason"),
});

export const insertSupplierPaymentSchema = createInsertSchema(supplierPaymentsTable).omit({ id: true, createdAt: true });
export type InsertSupplierPayment = z.infer<typeof insertSupplierPaymentSchema>;
export type SupplierPaymentRow = typeof supplierPaymentsTable.$inferSelect;
