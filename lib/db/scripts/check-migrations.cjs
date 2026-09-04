#!/usr/bin/env node
/*
 * PharmaCore — read-only DB migration checker
 *
 * Purpose: verify that every committed migration (lib/db/drizzle/0000..0015)
 * has actually been applied to the live database. It inspects the Postgres
 * catalog (information_schema + pg_enum) for each migration's signature
 * schema objects (tables, columns, enums). It performs NO writes — safe to
 * run against production.
 *
 * Usage:
 *   SET SUPABASE_DATABASE_URL=postgresql://user:pass@host:port/db \
 *     node check-migrations.js
 *   (or) node check-migrations.js "postgresql://user:pass@host:port/db"
 *
 * Output:
 *   Per-migration PASS/FAIL lines plus a final summary.
 *   Exit code 0 = all applied; 1 = one or more MISSING.
 */
const { Pool } = require("pg");

const DB_URL = process.env.SUPABASE_DATABASE_URL
  ?? process.env.DATABASE_URL
  ?? process.argv[2];

if (!DB_URL) {
  console.error(
    "Missing DB connection. Pass it as an argument or set SUPABASE_DATABASE_URL/DATABASE_URL.",
  );
  process.exit(2);
}

// Each migration is identified by one or more *signature* catalog objects.
// Using the object introduced by that migration lets us verify it was applied
// without relying on drizzle's migration-history table (many of these were
// applied via the manual supabase-catchup.sql, which does not record history).
const MIGRATIONS = [
  { id: "0000", tag: "greedy_plazm (core schema)",         tables: ["users", "medicines", "suppliers", "purchase_orders", "orders", "order_items", "patients", "prescriptions"] },
  { id: "0001", tag: "supplier_payments",                  tables: ["supplier_payments"], enums: ["supplier_payment_method"] },
  { id: "0002", tag: "medicine_units (multi-packaging)",   tables: ["medicine_units"], cols: { "order_items": ["unit_name", "conversion_factor_to_base"] } },
  { id: "0003", tag: "pharmacy_settings",                  tables: ["pharmacy_settings"] },
  { id: "0004", tag: "fixes_and_features",                 cols: { "medicines": ["reorder_level"], "orders": ["prescription_id"], "prescriptions": ["attachment_url"], "purchase_order_items": ["batch_number", "expiry_date"] } },
  { id: "0005", tag: "multi_batch_tracking (FEFO)",        tables: ["medicine_batches", "order_item_batch_allocations"] },
  { id: "0006", tag: "user_deactivation",                  cols: { "users": ["is_active"] } },
  { id: "0007", tag: "password_reset",                     cols: { "users": ["reset_token_hash", "reset_token_expires_at"] } },
  { id: "0008", tag: "audit_log",                          tables: ["audit_logs"] },
  { id: "0009", tag: "tax_discounts_returns_writeoff",     cols: { "pharmacy_settings": ["tax_rate_percent"], "orders": ["discount_amount", "tax_amount"], "order_items": ["returned_quantity"], "medicine_batches": ["write_off_reason", "write_off_at", "write_off_by"], "medicines": ["barcode"] }, tables: ["order_item_returns"] },
  { id: "0010", tag: "granular_roles",                     enums: ["role"], role_vals: ["cashier", "viewer"] },
  { id: "0011", tag: "supplier_returns/cash_shifts/insurance", tables: ["supplier_returns", "supplier_return_items", "cash_shifts", "insurance_claims"], enums: ["cash_shift_status", "insurance_claim_status"], sp_vals: ["credit"] },
  { id: "0012", tag: "drug_contraindications",             tables: ["drug_contraindications"], enums: ["contraindication_type", "contraindication_severity"] },
  { id: "0013", tag: "sig_stocktake",                      tables: ["stocktakes", "stocktake_items"], enums: ["stocktake_status"], cols: { "order_items": ["sig"] } },
  { id: "0014", tag: "insurance_pre_authorizations",       tables: ["insurance_pre_authorizations"], enums: ["insurance_pa_status"] },
  { id: "0015", tag: "currency_settings",                  cols: { "pharmacy_settings": ["currency_symbol", "currency_position"] } },
  { id: "0016", tag: "supplier_ledger_reversal",           cols: { "supplier_payments": ["voided_at", "void_reason"] } },
];

async function main() {
  const pool = new Pool({
    connectionString: DB_URL,
    ssl: DB_URL.includes("localhost") || DB_URL.includes("127.0.0.1")
      ? false
      : { rejectUnauthorized: false },
    max: 1,
  });

  let missing = 0;
  const lines = [];

  try {
    const tableRes = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'`,
    );
    const tables = new Set(tableRes.rows.map((r) => r.table_name));

    const colRes = await pool.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public'`,
    );
    const cols = new Map();
    for (const r of colRes.rows) {
      if (!cols.has(r.table_name)) cols.set(r.table_name, new Set());
      cols.get(r.table_name).add(r.column_name);
    }

    const enumRes = await pool.query(
      `SELECT t.typname AS name, e.enumlabel AS label
       FROM pg_type t
       JOIN pg_enum e ON t.oid = e.enumtypid
       JOIN pg_namespace n ON t.typnamespace = n.oid
       WHERE n.nspname = 'public'`,
    );
    const enumLabels = new Map();
    for (const r of enumRes.rows) {
      if (!enumLabels.has(r.name)) enumLabels.set(r.name, new Set());
      enumLabels.get(r.name).add(r.label);
    }

    for (const m of MIGRATIONS) {
      const problems = [];
      const have = (t) => tables.has(t);
      const haveCol = (t, c) => cols.has(t) && cols.get(t).has(c);
      const haveEnum = (e) => enumLabels.has(e);
      const hasEnumVal = (e, v) => enumLabels.has(e) && enumLabels.get(e).has(v);

      for (const t of m.tables || []) {
        if (!have(t)) problems.push(`table "public.${t}"`);
      }
      for (const [t, list] of Object.entries(m.cols || {})) {
        for (const c of list) {
          if (!haveCol(t, c)) problems.push(`column "${t}.${c}"`);
          else if (!tables.has(t)) problems.push(`table "${t}" (for column ${c})`);
        }
      }
      for (const e of m.enums || []) {
        if (!haveEnum(e)) problems.push(`enum "public.${e}"`);
      }
      for (const v of m.role_vals || []) {
        if (!hasEnumVal("role", v)) problems.push(`enum role value '${v}'`);
      }
      for (const v of m.sp_vals || []) {
        if (!hasEnumVal("supplier_payment_method", v)) problems.push(`enum supplier_payment_method value '${v}'`);
      }

      const ok = problems.length === 0;
      if (!ok) missing += 1;
      lines.push(`${ok ? "APPLIED " : "MISSING "} | ${m.id} ${m.tag}${ok ? "" : "  ->  " + problems.join(", ")}`);
    }
  } finally {
    await pool.end();
  }

  for (const l of lines) console.log(l);

  console.log("\n----------------------------------------");
  const applied = MIGRATIONS.length - missing;
  console.log(`Summary: ${applied}/${MIGRATIONS.length} migrations verified applied.`);
  if (missing) {
    console.log(`\n⚠  ${missing} migration(s) appear NOT applied to this database.`);
    console.log("Review the MISSING lines above, then run the corresponding");
    console.log("lib/db/drizzle/XXXX_*.sql (in order) in the Supabase SQL Editor.");
    process.exit(1);
  } else {
    console.log("✅ All committed migrations are present in this database.");
  }
}

main().catch((err) => {
  console.error("Failed to run migration check:", err.message);
  process.exit(2);
});
