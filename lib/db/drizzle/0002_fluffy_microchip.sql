CREATE TYPE "public"."controlled_schedule" AS ENUM('II', 'III', 'IV', 'V');--> statement-breakpoint
CREATE TYPE "public"."supplier_payment_method" AS ENUM('cash', 'bank', 'cheque', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."cash_shift_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."insurance_claim_status" AS ENUM('submitted', 'approved', 'rejected', 'paid');--> statement-breakpoint
CREATE TYPE "public"."allergy_severity" AS ENUM('mild', 'moderate', 'severe');--> statement-breakpoint
CREATE TYPE "public"."interaction_severity" AS ENUM('minor', 'moderate', 'major', 'contraindicated');--> statement-breakpoint
ALTER TYPE "public"."role" ADD VALUE 'cashier';--> statement-breakpoint
ALTER TYPE "public"."role" ADD VALUE 'viewer';--> statement-breakpoint
CREATE TABLE "medicine_units" (
	"id" serial PRIMARY KEY NOT NULL,
	"medicine_id" integer NOT NULL,
	"unit_name" text NOT NULL,
	"conversion_factor_to_base" integer DEFAULT 1 NOT NULL,
	"is_base_unit" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medicine_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"medicine_id" integer NOT NULL,
	"batch_number" text,
	"expiry_date" date,
	"quantity" integer DEFAULT 0 NOT NULL,
	"cost_price" numeric(12, 4),
	"supplier_id" integer,
	"purchase_order_id" integer,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"write_off_reason" text,
	"write_off_at" timestamp with time zone,
	"write_off_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_item_returns" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_item_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"reason" text,
	"refund_amount" numeric(10, 2) NOT NULL,
	"processed_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_item_batch_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_item_id" integer NOT NULL,
	"medicine_batch_id" integer NOT NULL,
	"quantity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"purchase_order_id" integer,
	"amount" numeric(10, 2) NOT NULL,
	"method" "supplier_payment_method" DEFAULT 'cash' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_return_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_return_id" integer NOT NULL,
	"medicine_id" integer NOT NULL,
	"medicine_batch_id" integer,
	"quantity" integer NOT NULL,
	"unit_cost" numeric(12, 4),
	"line_total" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_returns" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"purchase_order_id" integer,
	"reason" text NOT NULL,
	"total_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pharmacy_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text DEFAULT 'My Pharmacy' NOT NULL,
	"address" text,
	"phone" text,
	"email" text,
	"license_number" text,
	"logo_url" text,
	"tax_rate_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"user_name" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_shifts" (
	"id" serial PRIMARY KEY NOT NULL,
	"opened_by" integer NOT NULL,
	"opening_float" numeric(10, 2) DEFAULT '0' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_by" integer,
	"closing_counted_cash" numeric(10, 2),
	"manual_cash_out" numeric(10, 2) DEFAULT '0' NOT NULL,
	"expected_cash" numeric(10, 2),
	"variance" numeric(10, 2),
	"notes" text,
	"closed_at" timestamp with time zone,
	"status" "cash_shift_status" DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insurance_claims" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"provider_name" text NOT NULL,
	"policy_number" text,
	"claim_amount" numeric(10, 2) NOT NULL,
	"status" "insurance_claim_status" DEFAULT 'submitted' NOT NULL,
	"submitted_by" integer,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "patient_allergies" (
	"id" serial PRIMARY KEY NOT NULL,
	"patient_id" integer NOT NULL,
	"allergen" text NOT NULL,
	"severity" "allergy_severity" DEFAULT 'moderate' NOT NULL,
	"reaction" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_conditions" (
	"id" serial PRIMARY KEY NOT NULL,
	"patient_id" integer NOT NULL,
	"condition" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drug_interactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"medicine1_id" integer NOT NULL,
	"medicine2_id" integer NOT NULL,
	"severity" "interaction_severity" NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "controlled_substance_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"medicine_id" integer NOT NULL,
	"patient_id" integer,
	"patient_name" text,
	"prescription_id" integer,
	"quantity_dispensed" integer NOT NULL,
	"schedule_at_dispensing" text NOT NULL,
	"dispensed_by" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reset_token_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reset_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "date_of_birth" date;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "medicines" ADD COLUMN "barcode" text;--> statement-breakpoint
ALTER TABLE "medicines" ADD COLUMN "reorder_level" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "medicines" ADD COLUMN "controlled_schedule" "controlled_schedule";--> statement-breakpoint
ALTER TABLE "medicines" ADD COLUMN "drug_class" text;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD COLUMN "attachment_url" text;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD COLUMN "max_refills" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD COLUMN "refills_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "unit_name" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "conversion_factor_to_base" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "returned_quantity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "prescription_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_amount" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tax_amount" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "unit_name" text;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "conversion_factor_to_base" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "medicine_units" ADD CONSTRAINT "medicine_units_medicine_id_medicines_id_fk" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicine_batches" ADD CONSTRAINT "medicine_batches_medicine_id_medicines_id_fk" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicine_batches" ADD CONSTRAINT "medicine_batches_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicine_batches" ADD CONSTRAINT "medicine_batches_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_returns" ADD CONSTRAINT "order_item_returns_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_returns" ADD CONSTRAINT "order_item_returns_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_batch_allocations" ADD CONSTRAINT "order_item_batch_allocations_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_batch_allocations" ADD CONSTRAINT "order_item_batch_allocations_medicine_batch_id_medicine_batches_id_fk" FOREIGN KEY ("medicine_batch_id") REFERENCES "public"."medicine_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_return_items" ADD CONSTRAINT "supplier_return_items_supplier_return_id_supplier_returns_id_fk" FOREIGN KEY ("supplier_return_id") REFERENCES "public"."supplier_returns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_return_items" ADD CONSTRAINT "supplier_return_items_medicine_id_medicines_id_fk" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_return_items" ADD CONSTRAINT "supplier_return_items_medicine_batch_id_medicine_batches_id_fk" FOREIGN KEY ("medicine_batch_id") REFERENCES "public"."medicine_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_allergies" ADD CONSTRAINT "patient_allergies_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_conditions" ADD CONSTRAINT "patient_conditions_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drug_interactions" ADD CONSTRAINT "drug_interactions_medicine1_id_medicines_id_fk" FOREIGN KEY ("medicine1_id") REFERENCES "public"."medicines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drug_interactions" ADD CONSTRAINT "drug_interactions_medicine2_id_medicines_id_fk" FOREIGN KEY ("medicine2_id") REFERENCES "public"."medicines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "controlled_substance_logs" ADD CONSTRAINT "controlled_substance_logs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "controlled_substance_logs" ADD CONSTRAINT "controlled_substance_logs_medicine_id_medicines_id_fk" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "controlled_substance_logs" ADD CONSTRAINT "controlled_substance_logs_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "controlled_substance_logs" ADD CONSTRAINT "controlled_substance_logs_prescription_id_prescriptions_id_fk" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "controlled_substance_logs" ADD CONSTRAINT "controlled_substance_logs_dispensed_by_users_id_fk" FOREIGN KEY ("dispensed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_prescription_id_prescriptions_id_fk" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescriptions"("id") ON DELETE no action ON UPDATE no action;