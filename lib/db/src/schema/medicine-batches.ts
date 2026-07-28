import { pgTable, serial, integer, text, date, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { medicinesTable } from "./medicines";
import { suppliersTable } from "./suppliers";
import { purchaseOrdersTable } from "./purchase-orders";

// Each row is one received lot of a medicine. `quantity` is what's LEFT in
// that lot (base units), decremented as sales consume it FEFO (first-expiry,
// first-out). `medicines.quantity` / `.batchNumber` / `.expiryDate` remain a
// fast-read cache derived from these rows — see lib/batch-helpers.ts.
export const medicineBatchesTable = pgTable("medicine_batches", {
  id: serial("id").primaryKey(),
  medicineId: integer("medicine_id").notNull().references(() => medicinesTable.id),
  batchNumber: text("batch_number"),
  expiryDate: date("expiry_date", { mode: "string" }),
  quantity: integer("quantity").notNull().default(0), // remaining base units in this lot
  costPrice: numeric("cost_price", { precision: 12, scale: 4 }), // what we paid, per base unit
  supplierId: integer("supplier_id").references(() => suppliersTable.id),
  purchaseOrderId: integer("purchase_order_id").references(() => purchaseOrdersTable.id),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  // Set when this batch's remaining stock was formally disposed of (e.g.
  // expired, damaged) rather than sold — distinguishes "sold out" from
  // "written off" in the batch's history.
  writeOffReason: text("write_off_reason"),
  writeOffAt: timestamp("write_off_at", { withTimezone: true }),
  writeOffBy: integer("write_off_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMedicineBatchSchema = createInsertSchema(medicineBatchesTable).omit({ id: true, createdAt: true });
export type InsertMedicineBatch = z.infer<typeof insertMedicineBatchSchema>;
export type MedicineBatch = typeof medicineBatchesTable.$inferSelect;
