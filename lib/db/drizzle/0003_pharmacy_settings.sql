-- Migration: pharmacy branding settings (singleton)
-- Apply via: Supabase SQL Editor or psql

CREATE TABLE IF NOT EXISTS "pharmacy_settings" (
  "id" INTEGER PRIMARY KEY DEFAULT 1,
  "name" TEXT NOT NULL DEFAULT 'My Pharmacy',
  "address" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "license_number" TEXT,
  "logo_url" TEXT,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the single settings row so the app can always PATCH id=1.
INSERT INTO "pharmacy_settings" ("id", "name")
VALUES (1, 'My Pharmacy')
ON CONFLICT ("id") DO NOTHING;
