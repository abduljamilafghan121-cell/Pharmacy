-- Migration: supplier ledger reversal (void wrong payments, reverse wrong receipts)
-- Apply via: Supabase SQL Editor or psql
-- IMPORTANT: run this AFTER 0015_currency_settings.sql

ALTER TABLE "supplier_payments"
  ADD COLUMN IF NOT EXISTS "voided_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "void_reason" TEXT;

CREATE INDEX IF NOT EXISTS "supplier_payments_voided_at_idx" ON "supplier_payments" ("voided_at");
