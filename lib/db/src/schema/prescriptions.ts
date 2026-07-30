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
  // Uploaded prescription image/PDF, stored as a data URI (consistent with
  // how the pharmacy logo is stored — no external file storage required).
  attachmentUrl: text("attachment_url"),
  status: prescriptionStatusEnum("status").notNull().default("pending"),
  verifiedBy: integer("verified_by").references(() => usersTable.id),
  notes: text("notes"),
  /** How many times this prescription may be refilled (0 = no refills, dispense once only) */
  maxRefills: integer("max_refills").notNull().default(0),
  /** Running count of how many times this prescription has been dispensed (first dispense = 0, increments on each refill) */
  refillsUsed: integer("refills_used").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPrescriptionSchema = createInsertSchema(prescriptionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPrescription = z.infer<typeof insertPrescriptionSchema>;
export type Prescription = typeof prescriptionsTable.$inferSelect;
