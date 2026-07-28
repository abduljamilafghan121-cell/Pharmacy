import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

// Deliberately simple/flat rather than a generic before/after diff store —
// a short human-readable description per entry is far more useful to a
// pharmacy owner scanning history than a JSON diff would be.
export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"), // no FK — keep the log even if the user is later removed
  userName: text("user_name"), // denormalized so history reads correctly even then
  action: text("action").notNull(), // e.g. "medicine.delete", "user.deactivate"
  entityType: text("entity_type").notNull(), // e.g. "medicine", "order", "user"
  entityId: integer("entity_id"),
  description: text("description").notNull(), // human-readable summary
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuditLog = typeof auditLogsTable.$inferSelect;
