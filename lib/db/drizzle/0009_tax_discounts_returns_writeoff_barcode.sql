-- Migration: tax, discounts, customer returns, batch write-offs, barcode/SKU
-- Apply via: Supabase SQL Editor or psql

-- 1. Tax rate (pharmacy-wide flat rate, e.g. 5.00 = 5%)
ALTER TABLE "pharmacy_settings"
  ADD COLUMN IF NOT EXISTS "tax_rate_percent" NUMERIC(5, 2) NOT NULL DEFAULT 0;

-- 2. Discount + tax breakdown on orders (subtotal stays pre-discount/pre-tax)
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "discount_amount" NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "tax_amount" NUMERIC(10, 2) NOT NULL DEFAULT 0;

-- 3. Customer returns
ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "returned_quantity" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "order_item_returns" (
  "id" SERIAL PRIMARY KEY,
  "order_item_id" INTEGER NOT NULL REFERENCES "order_items"("id"),
  "quantity" INTEGER NOT NULL,
  "reason" TEXT,
  "refund_amount" NUMERIC(10, 2) NOT NULL,
  "processed_by" INTEGER REFERENCES "users"("id"),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Expired/damaged stock write-off, tracked directly on the batch
ALTER TABLE "medicine_batches"
  ADD COLUMN IF NOT EXISTS "write_off_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "write_off_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "write_off_by" INTEGER;

-- 5. Barcode/SKU
ALTER TABLE "medicines"
  ADD COLUMN IF NOT EXISTS "barcode" TEXT;

CREATE INDEX IF NOT EXISTS "medicines_barcode_idx" ON "medicines" ("barcode");
