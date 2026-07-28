import { pgTable, serial, integer, text, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";
import { usersTable } from "./users";

export const insuranceClaimStatusEnum = pgEnum("insurance_claim_status", ["submitted", "approved", "rejected", "paid"]);

export const insuranceClaimsTable = pgTable("insurance_claims", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  providerName: text("provider_name").notNull(),
  policyNumber: text("policy_number"),
  claimAmount: numeric("claim_amount", { precision: 10, scale: 2 }).notNull(),
  status: insuranceClaimStatusEnum("status").notNull().default("submitted"),
  submittedBy: integer("submitted_by").references(() => usersTable.id),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  notes: text("notes"),
});

export type InsuranceClaim = typeof insuranceClaimsTable.$inferSelect;
