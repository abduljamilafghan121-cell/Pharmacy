import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { patientsTable } from "./patients";

export const allergySeverityEnum = pgEnum("allergy_severity", ["mild", "moderate", "severe"]);

export const patientAllergiesTable = pgTable("patient_allergies", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  /** The allergen name — drug name, drug class, or substance (e.g. "Penicillin", "Sulfonamides", "Aspirin") */
  allergen: text("allergen").notNull(),
  severity: allergySeverityEnum("severity").notNull().default("moderate"),
  /** Known reaction description, e.g. "hives", "anaphylaxis", "rash" */
  reaction: text("reaction"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPatientAllergySchema = createInsertSchema(patientAllergiesTable).omit({ id: true, createdAt: true });
export type InsertPatientAllergy = z.infer<typeof insertPatientAllergySchema>;
export type PatientAllergy = typeof patientAllergiesTable.$inferSelect;
