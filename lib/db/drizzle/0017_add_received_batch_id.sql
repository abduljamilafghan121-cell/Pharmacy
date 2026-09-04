-- Migration: link PO items to the batch they were received into
-- Apply via: Supabase SQL Editor or psql
-- IMPORTANT: run this AFTER 0016_supplier_ledger_reversal.sql

ALTER TABLE "purchase_order_items"
  ADD COLUMN IF NOT EXISTS "received_batch_id" INTEGER;
