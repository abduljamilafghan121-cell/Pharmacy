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

export const pool = new Pool({
  connectionString: databaseUrl,
  // Supabase (and most hosted Postgres providers) require SSL.
  // Replit's managed DB is on localhost so SSL is not needed there.
  ssl: databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1")
    ? false
    : { rejectUnauthorized: false },
});
export const db = drizzle(pool, { schema });

export * from "./schema";
