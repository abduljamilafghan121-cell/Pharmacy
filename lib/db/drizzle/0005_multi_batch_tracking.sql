-- Migration: multi-batch (FEFO) stock tracking
-- Apply via: Supabase SQL Editor or psql
-- IMPORTANT: run this AFTER 0004_fixes_and_features.sql

CREATE TABLE IF NOT EXISTS "medicine_batches" (
  "id" SERIAL PRIMARY KEY,
  "medicine_id" INTEGER NOT NULL REFERENCES "medicines"("id"),
  "batch_number" TEXT,
  "expiry_date" DATE,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "cost_price" NUMERIC(12, 4),
  "supplier_id" INTEGER REFERENCES "suppliers"("id"),
  "purchase_order_id" INTEGER REFERENCES "purchase_orders"("id"),
  "received_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "medicine_batches_medicine_id_idx" ON "medicine_batches" ("medicine_id");
CREATE INDEX IF NOT EXISTS "medicine_batches_expiry_idx" ON "medicine_batches" ("expiry_date");

CREATE TABLE IF NOT EXISTS "order_item_batch_allocations" (
  "id" SERIAL PRIMARY KEY,
  "order_item_id" INTEGER NOT NULL REFERENCES "order_items"("id"),
  "medicine_batch_id" INTEGER NOT NULL REFERENCES "medicine_batches"("id"),
  "quantity" INTEGER NOT NULL
);

-- Backfill: every medicine's CURRENT quantity/batch/expiry becomes its
-- first batch row, so no existing stock is lost when this ships. Medicines
-- with 0 quantity still get a zero-quantity batch row for a consistent
-- history (harmless — FEFO allocation skips empty batches).
INSERT INTO "medicine_batches" ("medicine_id", "batch_number", "expiry_date", "quantity", "supplier_id", "received_at")
SELECT "id", "batch_number", "expiry_date", "quantity", "supplier_id", COALESCE("created_at", NOW())
FROM "medicines"
WHERE NOT EXISTS (SELECT 1 FROM "medicine_batches" WHERE "medicine_batches"."medicine_id" = "medicines"."id");
