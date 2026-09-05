-- Migration: per-unit (per-pack) barcode + optional direct sell price
-- Apply via: Supabase SQL Editor or psql
-- IMPORTANT: run this AFTER 0017_add_received_batch_id.sql

-- barcode: package-specific scannable code (null = not bound to a barcode)
ALTER TABLE "medicine_units"
  ADD COLUMN IF NOT EXISTS "barcode" TEXT;

-- sell_price: optional direct retail price for this package. When set it
-- overrides the derived price (base price × conversion factor) in sales.
ALTER TABLE "medicine_units"
  ADD COLUMN IF NOT EXISTS "sell_price" NUMERIC(10, 2);

CREATE INDEX IF NOT EXISTS "medicine_units_barcode_idx" ON "medicine_units" ("barcode");