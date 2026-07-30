-- SIG: structured dosing instructions stored per order item
ALTER TABLE "order_items" ADD COLUMN "sig" text;

-- Stocktake / cycle count
CREATE TYPE "stocktake_status" AS ENUM ('draft', 'in_progress', 'finalized');

CREATE TABLE "stocktakes" (
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

CREATE TABLE "stocktake_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "stocktake_id" integer NOT NULL REFERENCES "stocktakes"("id") ON DELETE CASCADE,
  "medicine_id" integer NOT NULL REFERENCES "medicines"("id"),
  "medicine_name" text NOT NULL,
  "system_quantity" integer NOT NULL DEFAULT 0,
  "counted_quantity" integer,
  "notes" text
);
