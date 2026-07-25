import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { medicinesTable } from "./medicines";

export const medicineUnitsTable = pgTable("medicine_units", {
  id: serial("id").primaryKey(),
  medicineId: integer("medicine_id").notNull().references(() => medicinesTable.id, { onDelete: "cascade" }),
  unitName: text("unit_name").notNull(),
  conversionFactorToBase: integer("conversion_factor_to_base").notNull().default(1),
  isBaseUnit: boolean("is_base_unit").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMedicineUnitSchema = createInsertSchema(medicineUnitsTable).omit({ id: true, createdAt: true });
export type InsertMedicineUnit = z.infer<typeof insertMedicineUnitSchema>;
export type MedicineUnit = typeof medicineUnitsTable.$inferSelect;
