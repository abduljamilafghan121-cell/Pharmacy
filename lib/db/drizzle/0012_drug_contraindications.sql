-- Drug-patient contraindications
-- Stores per-medicine rules that fire warnings or hard blocks at the point of sale
-- when the dispensing patient matches a condition, age range, or gender criterion.

CREATE TYPE "contraindication_type" AS ENUM ('condition', 'min_age', 'max_age', 'gender');
CREATE TYPE "contraindication_severity" AS ENUM ('warn', 'block');

CREATE TABLE "drug_contraindications" (
  "id" serial PRIMARY KEY NOT NULL,
  "medicine_id" integer NOT NULL REFERENCES "medicines"("id") ON DELETE CASCADE,
  "contraindication_type" "contraindication_type" NOT NULL,
  "value" text NOT NULL,
  "severity" "contraindication_severity" NOT NULL DEFAULT 'warn',
  "description" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
