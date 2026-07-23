import { pgTable, serial, timestamp, integer, numeric, text, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { patientsTable } from "./patients";
import { medicinesTable } from "./medicines";

export const orderStatusEnum = pgEnum("order_status", ["pending", "dispensed", "cancelled"]);
export const paymentStatusEnum = pgEnum("payment_status", ["unpaid", "paid", "refunded"]);

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").references(() => patientsTable.id),
  patientName: text("patient_name"),             // quick walk-in name if no patient record
  servedBy: integer("served_by").references(() => usersTable.id), // pharmacist who made the sale
  status: orderStatusEnum("status").notNull().default("dispensed"),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 10, scale: 2 }).notNull().default("0"),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("unpaid"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const orderItemsTable = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  medicineId: integer("medicine_id").notNull().references(() => medicinesTable.id),
  quantity: integer("quantity").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOrderItemSchema = createInsertSchema(orderItemsTable).omit({ id: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type Order = typeof ordersTable.$inferSelect;
export type OrderItem = typeof orderItemsTable.$inferSelect;
