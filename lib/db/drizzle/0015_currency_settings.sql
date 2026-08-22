-- Migration: display-only currency label for pharmacy settings
-- Apply via: Supabase SQL Editor or psql
--
-- This is NOT a live currency / exchange-rate feature. Every amount
-- already stored anywhere in the database keeps its existing numeric
-- value; these two columns only control how that number is *labeled*
-- everywhere it's displayed (receipts, order history, reports, etc).

ALTER TABLE "pharmacy_settings"
  ADD COLUMN IF NOT EXISTS "currency_symbol" TEXT NOT NULL DEFAULT '$',
  ADD COLUMN IF NOT EXISTS "currency_position" TEXT NOT NULL DEFAULT 'prefix';

ALTER TABLE "pharmacy_settings"
  ADD CONSTRAINT "pharmacy_settings_currency_position_check"
  CHECK ("currency_position" IN ('prefix', 'suffix'));
