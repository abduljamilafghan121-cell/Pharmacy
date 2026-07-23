import { pgTable, text, serial, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { patientsTable } from "./patients";

export const prescriptionStatusEnum = pgEnum("prescription_status", ["pending", "verified", "rejected"]);

export const prescriptionsTable = pgTable("prescriptions", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").references(() => patientsTable.id),
  patientName: text("patient_name"),       // quick name if no patient record
  doctorName: text("doctor_name"),
  status: prescriptionStatusEnum("status").notNull().default("pending"),
  verifiedBy: integer("verified_by").references(() => usersTable.id),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPrescriptionSchema = createInsertSchema(prescriptionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPrescription = z.infer<typeof insertPrescriptionSchema>;
export type Prescription = typeof prescriptionsTable.$inferSelect;
