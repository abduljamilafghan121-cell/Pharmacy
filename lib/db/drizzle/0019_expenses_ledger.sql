-- Migration: Expenses ledger
-- Apply via: Supabase SQL Editor or psql
-- IMPORTANT: run this AFTER 0018_unit_barcode_and_pricing.sql

-- expense category enum
DO $$ BEGIN
  CREATE TYPE "expense_category" AS ENUM (
    'rent','utilities','salaries','supplies',
    'maintenance','marketing','transport','insurance','miscellaneous'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- expense payment method enum (mirrors supplier_payment_method)
DO $$ BEGIN
  CREATE TYPE "expense_payment_method" AS ENUM ('cash','bank','cheque','transfer','credit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "expenses" (
  "id" SERIAL PRIMARY KEY,
  "category" "expense_category" NOT NULL,
  "description" TEXT NOT NULL,
  "amount" NUMERIC(10, 2) NOT NULL,
  "method" "expense_payment_method" NOT NULL DEFAULT 'cash',
  "expense_date" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "note" TEXT,
  "recorded_by" INTEGER NOT NULL REFERENCES "users"("id"),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "voided_at" TIMESTAMPTZ,
  "void_reason" TEXT
);

CREATE INDEX IF NOT EXISTS "expenses_date_idx" ON "expenses" ("expense_date" DESC);
CREATE INDEX IF NOT EXISTS "expenses_category_idx" ON "expenses" ("category");