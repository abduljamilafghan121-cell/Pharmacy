import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { medicinesTable } from "./medicines";
import { ordersTable } from "./orders";
import { patientsTable } from "./patients";
import { usersTable } from "./users";
import { prescriptionsTable } from "./prescriptions";

/**
 * Immutable audit log for every dispensing event involving a controlled substance
 * (Schedule II–V). One row per medicine line item in a sale — never deleted.
 */
export const controlledSubstanceLogsTable = pgTable("controlled_substance_logs", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  medicineId: integer("medicine_id").notNull().references(() => medicinesTable.id),
  patientId: integer("patient_id").references(() => patientsTable.id),
  patientName: text("patient_name"),
  prescriptionId: integer("prescription_id").references(() => prescriptionsTable.id),
  quantityDispensed: integer("quantity_dispensed").notNull(),
  /** The controlled schedule of the medicine at the time of dispensing (snapshot) */
  scheduleAtDispensing: text("schedule_at_dispensing").notNull(),
  dispensedBy: integer("dispensed_by").notNull().references(() => usersTable.id),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertControlledSubstanceLogSchema = createInsertSchema(controlledSubstanceLogsTable).omit({ id: true, createdAt: true });
export type InsertControlledSubstanceLog = z.infer<typeof insertControlledSubstanceLogSchema>;
export type ControlledSubstanceLog = typeof controlledSubstanceLogsTable.$inferSelect;
