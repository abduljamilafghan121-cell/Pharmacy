import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// Vercel/Supabase deployments commonly use SUPABASE_DATABASE_URL, while
// Replit's managed database uses DATABASE_URL. Keep the runtime connection
// behavior aligned with drizzle.config.ts and support either name.
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
  // Replit's managed DB is on localhost so SSL is not needed there.
  ssl: isLocal ? false : { rejectUnauthorized: false },

  // Serverless-friendly settings: Vercel spins up many short-lived function
  // instances. Without these limits each instance opens its own pool, which
  // quickly exhausts Supabase's ~20 direct-connection cap and causes ETIMEDOUT.
  max: 1,                      // one connection per serverless instance
  connectionTimeoutMillis: 10_000, // fail fast rather than hanging forever
  idleTimeoutMillis: 0,        // release connections immediately when idle
});

// prepare: false is required when connecting through Supabase's PgBouncer
// transaction pooler (port 6543). It is harmless on direct connections.
export const db = drizzle(pool, { schema, casing: "snake_case", prepare: false });

export * from "./schema";
