import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// SUPABASE_DATABASE_URL takes precedence when set; DATABASE_URL is the
// common fallback name used by most Postgres hosting providers. Keep the
// runtime connection behavior aligned with drizzle.config.ts.
const databaseUrl = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "Database connection is not configured. Set SUPABASE_DATABASE_URL (Supabase) or DATABASE_URL.",
  );
}

const isLocal =
  databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1");

export const pool = new Pool({
  connectionString: databaseUrl,
  // Supabase (and most hosted Postgres providers) require SSL.
  // A local Postgres instance on localhost typically doesn't need it.
  ssl: isLocal ? false : { rejectUnauthorized: false },

  // Serverless-friendly settings: Vercel spins up many short-lived function
  // instances. Without these limits each instance opens its own pool, which
  // quickly exhausts Supabase's ~20 direct-connection cap and causes ETIMEDOUT.
  max: 1,                      // one connection per serverless instance
  connectionTimeoutMillis: 10_000, // fail fast rather than hanging forever
  idleTimeoutMillis: 0,        // release connections immediately when idle
});

export const db = drizzle(pool, { schema, casing: "snake_case" });

export * from "./schema";
