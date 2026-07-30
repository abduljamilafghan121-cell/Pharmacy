import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { patientsTable } from "./patients";
import { medicinesTable } from "./medicines";
import { prescriptionsTable } from "./prescriptions";
import { usersTable } from "./users";

export const paStatusEnum = pgEnum("insurance_pa_status", ["pending", "approved", "denied", "expired"]);

export const insurancePreAuthsTable = pgTable("insurance_pre_authorizations", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").references(() => patientsTable.id),
  medicineId: integer("medicine_id").notNull().references(() => medicinesTable.id),
  prescriptionId: integer("prescription_id").references(() => prescriptionsTable.id),
  insurerName: text("insurer_name").notNull(),
  policyNumber: text("policy_number"),
  diagnosisCode: text("diagnosis_code"),
  requestedBy: integer("requested_by").references(() => usersTable.id),
  status: paStatusEnum("status").notNull().default("pending"),
  referenceNumber: text("reference_number"),
  notes: text("notes"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export type InsurancePreAuth = typeof insurancePreAuthsTable.$inferSelect;
