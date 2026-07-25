-- Migration: multi-level packaging support
-- Apply via: Supabase SQL Editor or psql

-- New table: packaging units per medicine
CREATE TABLE IF NOT EXISTS "medicine_units" (
  "id" SERIAL PRIMARY KEY,
  "medicine_id" INTEGER NOT NULL REFERENCES "medicines"("id") ON DELETE CASCADE,
  "unit_name" TEXT NOT NULL,
  "conversion_factor_to_base" INTEGER NOT NULL DEFAULT 1,
  "is_base_unit" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add unit tracking columns to order_items
-- quantity stays as the user-facing quantity (e.g. 2 strips)
-- conversion_factor_to_base records how to convert to base units for stock operations
ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "unit_name" TEXT,
  ADD COLUMN IF NOT EXISTS "conversion_factor_to_base" INTEGER NOT NULL DEFAULT 1;

-- Add unit tracking columns to purchase_order_items
ALTER TABLE "purchase_order_items"
  ADD COLUMN IF NOT EXISTS "unit_name" TEXT,
  ADD COLUMN IF NOT EXISTS "conversion_factor_to_base" INTEGER NOT NULL DEFAULT 1;
