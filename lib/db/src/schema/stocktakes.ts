import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { medicinesTable } from "./medicines";

export const stocktakeStatusEnum = pgEnum("stocktake_status", ["draft", "in_progress", "finalized"]);

export const stocktakesTable = pgTable("stocktakes", {
  id: serial("id").primaryKey(),
  reference: text("reference").notNull(),
  status: stocktakeStatusEnum("status").notNull().default("in_progress"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => usersTable.id),
  finalizedBy: integer("finalized_by").references(() => usersTable.id),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const stocktakeItemsTable = pgTable("stocktake_items", {
  id: serial("id").primaryKey(),
  stocktakeId: integer("stocktake_id").notNull().references(() => stocktakesTable.id),
  medicineId: integer("medicine_id").notNull().references(() => medicinesTable.id),
  medicineName: text("medicine_name").notNull(),
  systemQuantity: integer("system_quantity").notNull().default(0),
  countedQuantity: integer("counted_quantity"),
  notes: text("notes"),
});

export const insertStocktakeSchema = createInsertSchema(stocktakesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStocktake = z.infer<typeof insertStocktakeSchema>;
export type Stocktake = typeof stocktakesTable.$inferSelect;
export type StocktakeItem = typeof stocktakeItemsTable.$inferSelect;
