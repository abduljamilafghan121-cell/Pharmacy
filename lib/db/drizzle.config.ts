import { defineConfig } from "drizzle-kit";
import path from "path";

// SUPABASE_DATABASE_URL takes precedence when running migrations against an
// external Supabase project. Falls back to DATABASE_URL.
const dbUrl = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error(
    "Set SUPABASE_DATABASE_URL (for Supabase) or DATABASE_URL to run migrations."
  );
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
  },
});
