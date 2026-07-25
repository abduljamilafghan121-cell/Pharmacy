CREATE TYPE "public"."supplier_payment_method" AS ENUM('cash', 'bank', 'cheque', 'transfer');--> statement-breakpoint
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
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;
