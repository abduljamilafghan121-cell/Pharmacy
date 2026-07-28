-- Migration: granular staff roles (cashier, viewer)
-- Apply via: Supabase SQL Editor or psql
-- NOTE: run this on its own, separate from any script that inserts rows
-- using the new values in the same transaction (Postgres requires the new
-- enum value to be committed before it can be used).

ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'cashier';
ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'viewer';
