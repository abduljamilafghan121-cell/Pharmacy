-- Migration: bug-fix & missing-feature batch
-- Apply via: Supabase SQL Editor or psql

-- 1. Per-medicine low-stock threshold (was hardcoded to 10 for everything)
ALTER TABLE "medicines"
  ADD COLUMN IF NOT EXISTS "reorder_level" INTEGER NOT NULL DEFAULT 10;

-- 2. Link a sale back to the prescription that authorized it
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "prescription_id" INTEGER REFERENCES "prescriptions"("id");

-- 3. Prescription file/image upload (was missing entirely)
ALTER TABLE "prescriptions"
  ADD COLUMN IF NOT EXISTS "attachment_url" TEXT;

-- 4. Batch/expiry per received purchase order line, so receiving new stock
--    can update the medicine's current batch number & expiry instead of
--    silently keeping the old (possibly stale) values.
ALTER TABLE "purchase_order_items"
  ADD COLUMN IF NOT EXISTS "batch_number" TEXT,
  ADD COLUMN IF NOT EXISTS "expiry_date" DATE;
