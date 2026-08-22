import { pgTable, text, integer, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Singleton table — always exactly one row (id = 1). Holds pharmacy
// branding/contact info used on printed receipts, dispensing slips,
// and anywhere else the pharmacy's identity needs to be shown.
export const pharmacySettingsTable = pgTable("pharmacy_settings", {
  id: integer("id").primaryKey().default(1),
  name: text("name").notNull().default("My Pharmacy"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  licenseNumber: text("license_number"),
  // Logo stored as a data URI (base64) so no external file storage /
  // upload service is required — consistent with how medicine images
  // are referenced elsewhere in this app.
  logoUrl: text("logo_url"),
  // Single flat tax rate applied at checkout (e.g. 5 = 5%). Real-world tax
  // rules vary a lot by region/product category — this covers the common
  // single-rate case; per-category tax would be a follow-up if needed.
  taxRatePercent: numeric("tax_rate_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  // Display-only currency label — NOT a live currency, no conversion is ever
  // applied. Every amount already stored in the database keeps its existing
  // numeric value; changing this only changes how that number is labeled
  // everywhere it's shown (receipts, order history, reports, etc). "prefix"
  // puts the symbol before the number ("$200.00"); "suffix" puts it after
  // with a space ("200.00 afg") — the convention most currency codes use.
  currencySymbol: text("currency_symbol").notNull().default("$"),
  currencyPosition: text("currency_position", { enum: ["prefix", "suffix"] }).notNull().default("prefix"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const upsertPharmacySettingsSchema = createInsertSchema(pharmacySettingsTable).omit({ id: true, updatedAt: true }).partial();
export type UpsertPharmacySettings = z.infer<typeof upsertPharmacySettingsSchema>;
export type PharmacySettings = typeof pharmacySettingsTable.$inferSelect;
