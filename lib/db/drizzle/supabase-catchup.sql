-- =============================================================================
-- SUPABASE CATCHUP MIGRATION — safe to run even if some steps already applied
-- Covers migrations 0001 through 0013.
-- Paste the ENTIRE file into the Supabase SQL Editor and click Run.
-- =============================================================================

-- ─── ENUMS ───────────────────────────────────────────────────────────────────

DO $$ BEGIN CREATE TYPE "public"."supplier_payment_method" AS ENUM('cash', 'bank', 'cheque', 'transfer'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."supplier_payment_method" ADD VALUE 'credit'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "public"."controlled_schedule" AS ENUM('II', 'III', 'IV', 'V'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "public"."cash_shift_status" AS ENUM('open', 'closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "public"."insurance_claim_status" AS ENUM('submitted', 'approved', 'rejected', 'paid'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "public"."allergy_severity" AS ENUM('mild', 'moderate', 'severe'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "public"."interaction_severity" AS ENUM('minor', 'moderate', 'major', 'contraindicated'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "public"."contraindication_type" AS ENUM('condition', 'min_age', 'max_age', 'gender'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "public"."contraindication_severity" AS ENUM('warn', 'block'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "public"."stocktake_status" AS ENUM('draft', 'in_progress', 'finalized'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE "public"."role" ADD VALUE IF NOT EXISTS 'cashier';
ALTER TYPE "public"."role" ADD VALUE IF NOT EXISTS 'viewer';

-- ─── NEW TABLES ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "supplier_payments" (
  "id" serial PRIMARY KEY NOT NULL,
  "supplier_id" integer NOT NULL REFERENCES "suppliers"("id"),
  "purchase_order_id" integer REFERENCES "purchase_orders"("id"),
  "amount" numeric(10, 2) NOT NULL,
  "method" "supplier_payment_method" NOT NULL DEFAULT 'cash',
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "medicine_units" (
  "id" serial PRIMARY KEY NOT NULL,
  "medicine_id" integer NOT NULL REFERENCES "medicines"("id") ON DELETE CASCADE,
  "unit_name" text NOT NULL,
  "conversion_factor_to_base" integer NOT NULL DEFAULT 1,
  "is_base_unit" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "medicine_batches" (
  "id" serial PRIMARY KEY NOT NULL,
  "medicine_id" integer NOT NULL REFERENCES "medicines"("id"),
  "batch_number" text,
  "expiry_date" date,
  "quantity" integer NOT NULL DEFAULT 0,
  "cost_price" numeric(12, 4),
  "supplier_id" integer REFERENCES "suppliers"("id"),
  "purchase_order_id" integer REFERENCES "purchase_orders"("id"),
  "received_at" timestamptz NOT NULL DEFAULT now(),
  "write_off_reason" text,
  "write_off_at" timestamptz,
  "write_off_by" integer REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "medicine_batches_medicine_id_idx" ON "medicine_batches" ("medicine_id");
CREATE INDEX IF NOT EXISTS "medicine_batches_expiry_idx" ON "medicine_batches" ("expiry_date");

-- Backfill existing medicines into batches (idempotent)
INSERT INTO "medicine_batches" ("medicine_id", "batch_number", "expiry_date", "quantity", "supplier_id", "received_at")
SELECT "id", "batch_number", "expiry_date", "quantity", "supplier_id", COALESCE("created_at", NOW())
FROM "medicines"
WHERE NOT EXISTS (
  SELECT 1 FROM "medicine_batches" WHERE "medicine_batches"."medicine_id" = "medicines"."id"
);

CREATE TABLE IF NOT EXISTS "order_item_batch_allocations" (
  "id" serial PRIMARY KEY NOT NULL,
  "order_item_id" integer NOT NULL REFERENCES "order_items"("id"),
  "medicine_batch_id" integer NOT NULL REFERENCES "medicine_batches"("id"),
  "quantity" integer NOT NULL
);

CREATE TABLE IF NOT EXISTS "order_item_returns" (
  "id" serial PRIMARY KEY NOT NULL,
  "order_item_id" integer NOT NULL REFERENCES "order_items"("id"),
  "quantity" integer NOT NULL,
  "reason" text,
  "refund_amount" numeric(10, 2) NOT NULL,
  "processed_by" integer REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "pharmacy_settings" (
  "id" integer PRIMARY KEY DEFAULT 1,
  "name" text NOT NULL DEFAULT 'My Pharmacy',
  "address" text,
  "phone" text,
  "email" text,
  "license_number" text,
  "logo_url" text,
  "tax_rate_percent" numeric(5, 2) NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
INSERT INTO "pharmacy_settings" ("id", "name") VALUES (1, 'My Pharmacy') ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer,
  "user_name" text,
  "action" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" integer,
  "description" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "audit_logs" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "audit_logs_entity_idx" ON "audit_logs" ("entity_type", "entity_id");

CREATE TABLE IF NOT EXISTS "cash_shifts" (
  "id" serial PRIMARY KEY NOT NULL,
  "opened_by" integer NOT NULL REFERENCES "users"("id"),
  "opening_float" numeric(10, 2) NOT NULL DEFAULT 0,
  "opened_at" timestamptz NOT NULL DEFAULT now(),
  "closed_by" integer REFERENCES "users"("id"),
  "closing_counted_cash" numeric(10, 2),
  "manual_cash_out" numeric(10, 2) NOT NULL DEFAULT 0,
  "expected_cash" numeric(10, 2),
  "variance" numeric(10, 2),
  "notes" text,
  "closed_at" timestamptz,
  "status" "cash_shift_status" NOT NULL DEFAULT 'open'
);
CREATE INDEX IF NOT EXISTS "cash_shifts_status_idx" ON "cash_shifts" ("status");

CREATE TABLE IF NOT EXISTS "insurance_claims" (
  "id" serial PRIMARY KEY NOT NULL,
  "order_id" integer NOT NULL REFERENCES "orders"("id"),
  "provider_name" text NOT NULL,
  "policy_number" text,
  "claim_amount" numeric(10, 2) NOT NULL,
  "status" "insurance_claim_status" NOT NULL DEFAULT 'submitted',
  "submitted_by" integer REFERENCES "users"("id"),
  "submitted_at" timestamptz NOT NULL DEFAULT now(),
  "resolved_at" timestamptz,
  "notes" text
);
CREATE INDEX IF NOT EXISTS "insurance_claims_status_idx" ON "insurance_claims" ("status");

CREATE TABLE IF NOT EXISTS "supplier_returns" (
  "id" serial PRIMARY KEY NOT NULL,
  "supplier_id" integer NOT NULL REFERENCES "suppliers"("id"),
  "purchase_order_id" integer REFERENCES "purchase_orders"("id"),
  "reason" text NOT NULL,
  "total_amount" numeric(10, 2) NOT NULL DEFAULT 0,
  "created_by" integer REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "supplier_return_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "supplier_return_id" integer NOT NULL REFERENCES "supplier_returns"("id"),
  "medicine_id" integer NOT NULL REFERENCES "medicines"("id"),
  "medicine_batch_id" integer REFERENCES "medicine_batches"("id"),
  "quantity" integer NOT NULL,
  "unit_cost" numeric(12, 4),
  "line_total" numeric(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS "patient_allergies" (
  "id" serial PRIMARY KEY NOT NULL,
  "patient_id" integer NOT NULL REFERENCES "patients"("id") ON DELETE CASCADE,
  "allergen" text NOT NULL,
  "severity" "allergy_severity" NOT NULL DEFAULT 'moderate',
  "reaction" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "patient_conditions" (
  "id" serial PRIMARY KEY NOT NULL,
  "patient_id" integer NOT NULL REFERENCES "patients"("id") ON DELETE CASCADE,
  "condition" text NOT NULL,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "drug_interactions" (
  "id" serial PRIMARY KEY NOT NULL,
  "medicine1_id" integer NOT NULL REFERENCES "medicines"("id") ON DELETE CASCADE,
  "medicine2_id" integer NOT NULL REFERENCES "medicines"("id") ON DELETE CASCADE,
  "severity" "interaction_severity" NOT NULL,
  "description" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "controlled_substance_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "order_id" integer NOT NULL REFERENCES "orders"("id"),
  "medicine_id" integer NOT NULL REFERENCES "medicines"("id"),
  "patient_id" integer REFERENCES "patients"("id"),
  "patient_name" text,
  "prescription_id" integer REFERENCES "prescriptions"("id"),
  "quantity_dispensed" integer NOT NULL,
  "schedule_at_dispensing" text NOT NULL,
  "dispensed_by" integer NOT NULL REFERENCES "users"("id"),
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "drug_contraindications" (
  "id" serial PRIMARY KEY NOT NULL,
  "medicine_id" integer NOT NULL REFERENCES "medicines"("id") ON DELETE CASCADE,
  "contraindication_type" "contraindication_type" NOT NULL,
  "value" text NOT NULL,
  "severity" "contraindication_severity" NOT NULL DEFAULT 'warn',
  "description" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "stocktakes" (
  "id" serial PRIMARY KEY NOT NULL,
  "reference" text NOT NULL,
  "status" "stocktake_status" NOT NULL DEFAULT 'in_progress',
  "notes" text,
  "created_by" integer REFERENCES "users"("id"),
  "finalized_by" integer REFERENCES "users"("id"),
  "finalized_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "stocktake_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "stocktake_id" integer NOT NULL REFERENCES "stocktakes"("id") ON DELETE CASCADE,
  "medicine_id" integer NOT NULL REFERENCES "medicines"("id"),
  "medicine_name" text NOT NULL,
  "system_quantity" integer NOT NULL DEFAULT 0,
  "counted_quantity" integer,
  "notes" text
);

-- ─── NEW COLUMNS ON EXISTING TABLES ──────────────────────────────────────────

-- users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "reset_token_hash" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "reset_token_expires_at" timestamptz;

-- patients
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "date_of_birth" date;
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "gender" text;

-- medicines
ALTER TABLE "medicines" ADD COLUMN IF NOT EXISTS "barcode" text;
ALTER TABLE "medicines" ADD COLUMN IF NOT EXISTS "reorder_level" integer NOT NULL DEFAULT 10;
ALTER TABLE "medicines" ADD COLUMN IF NOT EXISTS "controlled_schedule" "controlled_schedule";
ALTER TABLE "medicines" ADD COLUMN IF NOT EXISTS "drug_class" text;
CREATE INDEX IF NOT EXISTS "medicines_barcode_idx" ON "medicines" ("barcode");

-- prescriptions
ALTER TABLE "prescriptions" ADD COLUMN IF NOT EXISTS "attachment_url" text;
ALTER TABLE "prescriptions" ADD COLUMN IF NOT EXISTS "max_refills" integer NOT NULL DEFAULT 0;
ALTER TABLE "prescriptions" ADD COLUMN IF NOT EXISTS "refills_used" integer NOT NULL DEFAULT 0;

-- orders
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "prescription_id" integer REFERENCES "prescriptions"("id");
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "discount_amount" numeric(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "tax_amount" numeric(10, 2) NOT NULL DEFAULT 0;

-- order_items
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "unit_name" text;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "conversion_factor_to_base" integer NOT NULL DEFAULT 1;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "returned_quantity" integer NOT NULL DEFAULT 0;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "sig" text;

-- purchase_order_items
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "unit_name" text;
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "conversion_factor_to_base" integer NOT NULL DEFAULT 1;
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "batch_number" text;
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "expiry_date" date;

-- pharmacy_settings
ALTER TABLE "pharmacy_settings" ADD COLUMN IF NOT EXISTS "tax_rate_percent" numeric(5, 2) NOT NULL DEFAULT 0;

-- medicine_batches (write-off columns added later)
ALTER TABLE "medicine_batches" ADD COLUMN IF NOT EXISTS "write_off_reason" text;
ALTER TABLE "medicine_batches" ADD COLUMN IF NOT EXISTS "write_off_at" timestamptz;
ALTER TABLE "medicine_batches" ADD COLUMN IF NOT EXISTS "write_off_by" integer REFERENCES "users"("id");
