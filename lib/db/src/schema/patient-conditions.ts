import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { patientsTable } from "./patients";

export const patientConditionsTable = pgTable("patient_conditions", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  /** Medical condition, e.g. "Type 2 Diabetes", "Renal Impairment", "Pregnancy", "Liver Disease" */
  condition: text("condition").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPatientConditionSchema = createInsertSchema(patientConditionsTable).omit({ id: true, createdAt: true });
export type InsertPatientCondition = z.infer<typeof insertPatientConditionSchema>;
export type PatientCondition = typeof patientConditionsTable.$inferSelect;
