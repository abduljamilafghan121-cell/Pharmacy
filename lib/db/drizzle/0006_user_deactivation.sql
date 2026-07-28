-- Migration: staff account deactivation
-- Apply via: Supabase SQL Editor or psql

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;
