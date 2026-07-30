import { pgTable, text, serial, timestamp, integer, boolean, numeric, date, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { categoriesTable } from "./categories";
import { suppliersTable } from "./suppliers";

/** DEA / regulatory schedule for controlled substances. null = not controlled. */
export const controlledScheduleEnum = pgEnum("controlled_schedule", ["II", "III", "IV", "V"]);

export const medicinesTable = pgTable("medicines", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  genericName: text("generic_name"),
  barcode: text("barcode"), // scanned via a USB/handheld barcode scanner, or entered manually
  categoryId: integer("category_id").references(() => categoriesTable.id),
  supplierId: integer("supplier_id").references(() => suppliersTable.id),
  manufacturer: text("manufacturer"),
  batchNumber: text("batch_number"),
  expiryDate: date("expiry_date", { mode: "string" }),
  quantity: integer("quantity").notNull().default(0),
  reorderLevel: integer("reorder_level").notNull().default(10),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  prescriptionRequired: boolean("prescription_required").notNull().default(false),
  /** DEA/regulatory schedule. null = not a controlled substance. */
  controlledSchedule: controlledScheduleEnum("controlled_schedule"),
  /** Pharmacological class, e.g. "NSAID", "Beta-blocker", "ACE-inhibitor" — used for interaction matching */
  drugClass: text("drug_class"),
  description: text("description"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertMedicineSchema = createInsertSchema(medicinesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMedicine = z.infer<typeof insertMedicineSchema>;
export type Medicine = typeof medicinesTable.$inferSelect;
