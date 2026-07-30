import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { medicinesTable } from "./medicines";

export const interactionSeverityEnum = pgEnum("interaction_severity", ["minor", "moderate", "major", "contraindicated"]);

export const drugInteractionsTable = pgTable("drug_interactions", {
  id: serial("id").primaryKey(),
  medicine1Id: integer("medicine1_id").notNull().references(() => medicinesTable.id, { onDelete: "cascade" }),
  medicine2Id: integer("medicine2_id").notNull().references(() => medicinesTable.id, { onDelete: "cascade" }),
  severity: interactionSeverityEnum("severity").notNull(),
  /** Plain-language description of the interaction, e.g. "Increased risk of bleeding" */
  description: text("description").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDrugInteractionSchema = createInsertSchema(drugInteractionsTable).omit({ id: true, createdAt: true });
export type InsertDrugInteraction = z.infer<typeof insertDrugInteractionSchema>;
export type DrugInteraction = typeof drugInteractionsTable.$inferSelect;
