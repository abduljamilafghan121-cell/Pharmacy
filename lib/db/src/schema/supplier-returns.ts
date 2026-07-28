import { pgTable, serial, integer, text, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { suppliersTable } from "./suppliers";
import { purchaseOrdersTable } from "./purchase-orders";
import { medicinesTable } from "./medicines";
import { medicineBatchesTable } from "./medicine-batches";
import { usersTable } from "./users";

export const supplierReturnsTable = pgTable("supplier_returns", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id),
  purchaseOrderId: integer("purchase_order_id").references(() => purchaseOrdersTable.id),
  reason: text("reason").notNull(),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const supplierReturnItemsTable = pgTable("supplier_return_items", {
  id: serial("id").primaryKey(),
  supplierReturnId: integer("supplier_return_id").notNull().references(() => supplierReturnsTable.id),
  medicineId: integer("medicine_id").notNull().references(() => medicinesTable.id),
  medicineBatchId: integer("medicine_batch_id").references(() => medicineBatchesTable.id),
  quantity: integer("quantity").notNull(), // base units returned
  unitCost: numeric("unit_cost", { precision: 12, scale: 4 }),
  lineTotal: numeric("line_total", { precision: 10, scale: 2 }).notNull(),
});

export type SupplierReturn = typeof supplierReturnsTable.$inferSelect;
export type SupplierReturnItem = typeof supplierReturnItemsTable.$inferSelect;
