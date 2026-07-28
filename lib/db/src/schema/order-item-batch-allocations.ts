import { pgTable, serial, integer } from "drizzle-orm/pg-core";
import { orderItemsTable } from "./orders";
import { medicineBatchesTable } from "./medicine-batches";

// Records that "this order item took N base units from this batch". A
// single order item can span multiple batches if one lot ran out mid-sale.
// This is what lets order cancellation restore stock to the CORRECT batch
// instead of just bumping the medicine's total (which would silently merge
// distinct expiry dates together again).
export const orderItemBatchAllocationsTable = pgTable("order_item_batch_allocations", {
  id: serial("id").primaryKey(),
  orderItemId: integer("order_item_id").notNull().references(() => orderItemsTable.id),
  medicineBatchId: integer("medicine_batch_id").notNull().references(() => medicineBatchesTable.id),
  quantity: integer("quantity").notNull(), // base units taken from this batch
});

export type OrderItemBatchAllocation = typeof orderItemBatchAllocationsTable.$inferSelect;
