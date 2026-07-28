-- Migration: supplier returns, cash register reconciliation, insurance claims
-- Apply via: Supabase SQL Editor or psql
-- NOTE: the ALTER TYPE statement should be run/committed before anything
-- that inserts a 'credit' supplier payment in the same session.

-- 1. Supplier returns
ALTER TYPE "supplier_payment_method" ADD VALUE IF NOT EXISTS 'credit';

CREATE TABLE IF NOT EXISTS "supplier_returns" (
  "id" SERIAL PRIMARY KEY,
  "supplier_id" INTEGER NOT NULL REFERENCES "suppliers"("id"),
  "purchase_order_id" INTEGER REFERENCES "purchase_orders"("id"),
  "reason" TEXT NOT NULL,
  "total_amount" NUMERIC(10, 2) NOT NULL DEFAULT 0,
  "created_by" INTEGER REFERENCES "users"("id"),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "supplier_return_items" (
  "id" SERIAL PRIMARY KEY,
  "supplier_return_id" INTEGER NOT NULL REFERENCES "supplier_returns"("id"),
  "medicine_id" INTEGER NOT NULL REFERENCES "medicines"("id"),
  "medicine_batch_id" INTEGER REFERENCES "medicine_batches"("id"),
  "quantity" INTEGER NOT NULL,
  "unit_cost" NUMERIC(12, 4),
  "line_total" NUMERIC(10, 2) NOT NULL
);

-- 2. Cash register shifts
DO $$ BEGIN
  CREATE TYPE "cash_shift_status" AS ENUM ('open', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "cash_shifts" (
  "id" SERIAL PRIMARY KEY,
  "opened_by" INTEGER NOT NULL REFERENCES "users"("id"),
  "opening_float" NUMERIC(10, 2) NOT NULL DEFAULT 0,
  "opened_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "closed_by" INTEGER REFERENCES "users"("id"),
  "closing_counted_cash" NUMERIC(10, 2),
  "manual_cash_out" NUMERIC(10, 2) NOT NULL DEFAULT 0,
  "expected_cash" NUMERIC(10, 2),
  "variance" NUMERIC(10, 2),
  "notes" TEXT,
  "closed_at" TIMESTAMPTZ,
  "status" "cash_shift_status" NOT NULL DEFAULT 'open'
);

CREATE INDEX IF NOT EXISTS "cash_shifts_status_idx" ON "cash_shifts" ("status");

-- 3. Insurance claims
DO $$ BEGIN
  CREATE TYPE "insurance_claim_status" AS ENUM ('submitted', 'approved', 'rejected', 'paid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "insurance_claims" (
  "id" SERIAL PRIMARY KEY,
  "order_id" INTEGER NOT NULL REFERENCES "orders"("id"),
  "provider_name" TEXT NOT NULL,
  "policy_number" TEXT,
  "claim_amount" NUMERIC(10, 2) NOT NULL,
  "status" "insurance_claim_status" NOT NULL DEFAULT 'submitted',
  "submitted_by" INTEGER REFERENCES "users"("id"),
  "submitted_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "resolved_at" TIMESTAMPTZ,
  "notes" TEXT
);

CREATE INDEX IF NOT EXISTS "insurance_claims_status_idx" ON "insurance_claims" ("status");
