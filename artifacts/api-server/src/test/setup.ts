import { vi } from "vitest";

// Replace @workspace/db (which validates SUPABASE_DATABASE_URL / DATABASE_URL
// at import time and would throw) with an in-memory Postgres backed by pg-mem.
// The schema is derived from the same drizzle schema objects the app imports,
// and the singleton `db` instance below is shared with the test helpers so
// seeds and route handlers operate on exactly the same database.
vi.mock("@workspace/db", async () => {
  const schemaNs = await import("@workspace/db/schema");
  const { getTestDb } = await import("./db-mock");
  const { db, pool } = await getTestDb();
  return { ...schemaNs, db, pool };
});