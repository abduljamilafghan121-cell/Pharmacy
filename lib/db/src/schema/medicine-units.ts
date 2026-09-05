import { pgTable, text, serial, timestamp, integer, boolean, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { medicinesTable } from "./medicines";

export const medicineUnitsTable = pgTable("medicine_units", {
  id: serial("id").primaryKey(),
  medicineId: integer("medicine_id").notNull().references(() => medicinesTable.id, { onDelete: "cascade" }),
  unitName: text("unit_name").notNull(),
  conversionFactorToBase: integer("conversion_factor_to_base").notNull().default(1),
  isBaseUnit: boolean("is_base_unit").notNull().default(false),
  // Scannable barcode specific to this package (e.g. a box may carry a
  // different barcode than a strip/tablet). Null = not bound to a barcode.
  barcode: text("barcode"),
  // Optional direct retail price for this package. When set it overrides the
  // derived price (base price × conversion factor) in sales.
  sellPrice: numeric("sell_price", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMedicineUnitSchema = createInsertSchema(medicineUnitsTable).omit({ id: true, createdAt: true });
export type InsertMedicineUnit = z.infer<typeof insertMedicineUnitSchema>;
export type MedicineUnit = typeof medicineUnitsTable.$inferSelect;
