import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { medicinesTable } from "./medicines";

/**
 * What kind of patient characteristic this contraindication targets.
 *   condition — a free-text patient condition (e.g. "Renal Impairment")
 *   min_age   — patient must be at least this many years old (value = number as string)
 *   max_age   — patient must be no older than this many years (value = number as string)
 *   gender    — contraindicated for this gender (value = "male" | "female" | "other")
 */
export const contraindicationTypeEnum = pgEnum("contraindication_type", [
  "condition",
  "min_age",
  "max_age",
  "gender",
]);

/**
 * warn  — show a warning but allow override (pharmacist discretion)
 * block — hard block; cannot dispense without removing the medicine
 */
export const contraindicationSeverityEnum = pgEnum("contraindication_severity", [
  "warn",
  "block",
]);

export const drugContraindicationsTable = pgTable("drug_contraindications", {
  id: serial("id").primaryKey(),
  /** The medicine this contraindication applies to */
  medicineId: integer("medicine_id")
    .notNull()
    .references(() => medicinesTable.id, { onDelete: "cascade" }),
  contraindicationType: contraindicationTypeEnum("contraindication_type").notNull(),
  /** Condition name, age limit as string, or gender value */
  value: text("value").notNull(),
  severity: contraindicationSeverityEnum("severity").notNull().default("warn"),
  /** Plain-language description shown to the pharmacist */
  description: text("description").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDrugContraindicationSchema = createInsertSchema(
  drugContraindicationsTable,
).omit({ id: true, createdAt: true });
export type InsertDrugContraindication = z.infer<typeof insertDrugContraindicationSchema>;
export type DrugContraindication = typeof drugContraindicationsTable.$inferSelect;
