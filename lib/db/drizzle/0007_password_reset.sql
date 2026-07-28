-- Migration: self-service password reset
-- Apply via: Supabase SQL Editor or psql

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "reset_token_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "reset_token_expires_at" TIMESTAMPTZ;
