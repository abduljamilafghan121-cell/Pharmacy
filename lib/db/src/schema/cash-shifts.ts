import { pgTable, serial, integer, text, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const cashShiftStatusEnum = pgEnum("cash_shift_status", ["open", "closed"]);

export const cashShiftsTable = pgTable("cash_shifts", {
  id: serial("id").primaryKey(),
  openedBy: integer("opened_by").notNull().references(() => usersTable.id),
  openingFloat: numeric("opening_float", { precision: 10, scale: 2 }).notNull().default("0"),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),

  closedBy: integer("closed_by").references(() => usersTable.id),
  closingCountedCash: numeric("closing_counted_cash", { precision: 10, scale: 2 }),
  manualCashOut: numeric("manual_cash_out", { precision: 10, scale: 2 }).notNull().default("0"), // e.g. cash refunds given during the shift
  expectedCash: numeric("expected_cash", { precision: 10, scale: 2 }),
  variance: numeric("variance", { precision: 10, scale: 2 }),
  notes: text("notes"),
  closedAt: timestamp("closed_at", { withTimezone: true }),

  status: cashShiftStatusEnum("status").notNull().default("open"),
});

export type CashShift = typeof cashShiftsTable.$inferSelect;
