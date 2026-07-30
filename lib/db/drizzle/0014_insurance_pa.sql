CREATE TYPE "public"."insurance_pa_status" AS ENUM('pending', 'approved', 'denied', 'expired');

CREATE TABLE "insurance_pre_authorizations" (
  "id" serial PRIMARY KEY NOT NULL,
  "patient_id" integer,
  "medicine_id" integer NOT NULL,
  "prescription_id" integer,
  "insurer_name" text NOT NULL,
  "policy_number" text,
  "diagnosis_code" text,
  "requested_by" integer,
  "status" "insurance_pa_status" NOT NULL DEFAULT 'pending',
  "reference_number" text,
  "notes" text,
  "submitted_at" timestamp with time zone NOT NULL DEFAULT now(),
  "resolved_at" timestamp with time zone,
  CONSTRAINT "insurance_pre_authorizations_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id"),
  CONSTRAINT "insurance_pre_authorizations_medicine_id_medicines_id_fk" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id"),
  CONSTRAINT "insurance_pre_authorizations_prescription_id_prescriptions_id_fk" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescriptions"("id"),
  CONSTRAINT "insurance_pre_authorizations_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id")
);
