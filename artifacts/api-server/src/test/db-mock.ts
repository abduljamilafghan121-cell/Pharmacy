import { newDb, type IMemoryDb } from "pg-mem";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { isTable, getTableName } from "drizzle-orm/table";
import { getTableColumns } from "drizzle-orm/utils";
import type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core";
import * as schema from "@workspace/db/schema";

export type TestDb = NodePgDatabase<typeof schema>;

type LooseColumn = AnyPgColumn & {
  enum?: { enumName?: string; enumValues?: string[] };
  precision?: number;
  scale?: number;
  length?: number;
  withTimezone?: boolean;
  defaultFn?: () => unknown;
};

export interface TestDbBundle {
  mem: IMemoryDb;
  pool: unknown;
  db: TestDb;
}

function enumDef(col: LooseColumn): { name: string; values: string[] } | null {
  const e = col.enum;
  if (e && e.enumName && Array.isArray(e.enumValues)) {
    return { name: e.enumName, values: e.enumValues };
  }
  return null;
}

function flattenSqlChunks(chunks: unknown[], out: string[]): void {
  for (const c of chunks ?? []) {
    if (typeof c === "string") {
      out.push(c);
    } else if (Array.isArray(c)) {
      flattenSqlChunks(c, out);
    } else if (c && typeof c === "object") {
      const nested = (c as { value?: unknown }).value;
      if (Array.isArray(nested)) {
        flattenSqlChunks(nested, out);
      } else if (typeof nested === "string") {
        out.push(nested);
      }
    }
  }
}

function renderDefault(col: LooseColumn): string | null {
  if (!col.hasDefault) return null;
  let raw: unknown = col.default;
  if (col.defaultFn) {
    try {
      raw = col.defaultFn();
    } catch {
      raw = undefined;
    }
  }
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "number") return `DEFAULT ${raw}`;
  if (typeof raw === "boolean") return `DEFAULT ${String(raw)}`;
  if (raw instanceof Date) return `DEFAULT '${raw.toISOString()}'`;
  if (typeof raw === "string") {
    if (/^now\(\)$/i.test(raw.trim())) return `DEFAULT now()`;
    return `DEFAULT '${raw.replace(/'/g, "''")}'`;
  }
  const chunks = (raw as { queryChunks?: unknown[] } | undefined)?.queryChunks;
  if (Array.isArray(chunks)) {
    const text: string[] = [];
    flattenSqlChunks(chunks, text);
    const joined = text.join("");
    return joined ? `DEFAULT ${joined}` : null;
  }
  return null;
}

function typeSql(col: LooseColumn): string {
  switch (col.columnType) {
    case "PgSerial":
      return "serial";
    case "PgBigSerial":
      return "bigserial";
    case "PgSmallSerial":
      return "smallserial";
    case "PgInteger":
      return "integer";
    case "PgBigInt":
      return "bigint";
    case "PgSmallInt":
      return "smallint";
    case "PgReal":
      return "real";
    case "PgDoublePrecision":
      return "double precision";
    case "PgText":
      return "text";
    case "PgVarchar":
      return col.length ? `varchar(${col.length})` : "varchar";
    case "PgChar":
      return col.length ? `char(${col.length})` : "char";
    case "PgBoolean":
      return "boolean";
    case "PgNumeric":
      return col.precision != null ? `numeric(${col.precision}, ${col.scale ?? 0})` : "numeric";
    case "PgJsonb":
      return "jsonb";
    case "PgJson":
      return "json";
    case "PgDate":
      return "date";
    case "PgTimestamp":
      return col.withTimezone ? "timestamp with time zone" : "timestamp";
    case "PgTime":
      return col.withTimezone ? "time with time zone" : "time";
    case "PgUuid":
      return "uuid";
    default: {
      const e = enumDef(col);
      return e ? `"${e.name}"` : "text";
    }
  }
}

function columnSql(col: LooseColumn): string {
  const parts = [`"${col.name}"`, typeSql(col)];
  if (col.notNull) parts.push("NOT NULL");
  if (col.primary) parts.push("PRIMARY KEY");
  const def = renderDefault(col);
  if (def) parts.push(def);
  return parts.join(" ");
}

function pgTables(): AnyPgTable[] {
  return (Object.values(schema) as unknown[]).filter((v): v is AnyPgTable => isTable(v as never));
}

function schemaDDL(): string[] {
  const tables = pgTables();
  const enums = new Map<string, string[]>();
  for (const t of tables) {
    for (const col of Object.values(getTableColumns(t))) {
      const info = enumDef(col as LooseColumn);
      if (info) enums.set(info.name, info.values);
    }
  }
  const stmts: string[] = [];
  for (const [name, values] of enums) {
    stmts.push(`CREATE TYPE "public"."${name}" AS ENUM (${values.map((v) => `'${v}'`).join(", ")});`);
  }
  for (const t of tables) {
    const cols = Object.values(getTableColumns(t)).map((c) => columnSql(c as LooseColumn));
    stmts.push(`CREATE TABLE "public"."${getTableName(t)}" (${cols.join(", ")});`);
  }
  return stmts;
}

type ColKind = "int" | "numeric" | "bool" | "date" | "json" | "text";

function colKind(col: LooseColumn): ColKind {
  switch (col.columnType) {
    case "PgSerial":
    case "PgBigSerial":
    case "PgInteger":
    case "PgSmallInteger":
    case "PgBigInteger":
      return "int";
    case "PgNumeric":
    case "PgReal":
    case "PgDoublePrecision":
      return "numeric";
    case "PgBoolean":
      return "bool";
    case "PgDate":
    case "PgTimestamp":
    case "PgTime":
      return "date";
    case "PgJson":
    case "PgJsonb":
      return "json";
    default:
      return "text";
  }
}

function buildColTypes(): Record<string, Record<string, ColKind>> {
  const map: Record<string, Record<string, ColKind>> = {};
  for (const t of pgTables()) {
    const perTable: Record<string, ColKind> = {};
    for (const col of Object.values(getTableColumns(t))) {
      perTable[col.name] = colKind(col as LooseColumn);
    }
    map[getTableName(t)] = perTable;
  }
  return map;
}

function paramLiteral(value: unknown, kind?: ColKind): string {
  if (value === null || value === undefined) return "null";
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  const s = String(value);
  if (kind === "int" || kind === "numeric") {
    if (/^[+-]?\d*(\.\d+)?$/.test(s) && !Number.isNaN(Number(s))) return s;
    return `'${s.replace(/'/g, "''")}'`;
  }
  if (kind === "bool") {
    if (s === "true" || s === "t" || s === "1") return "true";
    if (s === "false" || s === "f" || s === "0") return "false";
    return `'${s.replace(/'/g, "''")}'`;
  }
  return `'${s.replace(/'/g, "''")}'`;
}

/**
 * Replaces pg-mem's default parameter binder for OUR statements. pg-mem inlines
 * every parameter (numbers included) as a quoted string literal, and its
 * evaluator then mishandles mixed-type arithmetic (e.g. `"quantity" - '2'`
 * evaluates to -98 instead of 98). Because we generate the schema ourselves,
 * we know each parameter's target column type and can inline correctly-typed
 * literals instead.
 */
function inlineParams(text: string, values: unknown[], colTypes: Record<string, Record<string, ColKind>>): string {
  const insertRe = /^\s*insert into\s+"([^"]+)"(?:\s+as\s+"[^"]+")?\s*\(([^)]*)\)/i.exec(text);
  if (insertRe) {
    const cols = insertRe[2]
      .split(",")
      .map((c) => c.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);
    const perTable = cols.length ? colTypes[insertRe[1]] : undefined;
    let i = 0;
    return text.replace(/\$(\d+)/g, (_m, n: string) => {
      const col = cols[i % Math.max(cols.length, 1)];
      i += 1;
      return paramLiteral(values[Number(n) - 1], perTable?.[col]);
    });
  }

  // UPDATE / DELETE / SELECT — bind each parameter to the column that
  // immediately precedes it in the same clause.
  let currentTable: string | null = null;
  let lastCol: string | null = null;
  return text.replace(/\b(?:update|into|from|join)\s+"([^"]+)"|"([^"]+)"|(\$\d+)/gi, (full, t, col, param) => {
    if (t !== undefined) {
      currentTable = t;
      lastCol = null;
      return full;
    }
    if (col !== undefined) {
      lastCol = col;
      return full;
    }
    const kind = currentTable && lastCol ? colTypes[currentTable]?.[lastCol] : undefined;
    return paramLiteral(values[Number(param.slice(1)) - 1], kind);
  });
}

let bundlePromise: Promise<TestDbBundle> | null = null;

function createBundle(): Promise<TestDbBundle> {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();

  // drizzle-orm's node-postgres driver is pickier than the plain `pg` API:
  // it sends a per-query `types.getTypeParser` config (which pg-mem rejects)
  // and asks for `rowMode: "array"` results (which pg-mem doesn't support).
  // Patch the pg-mem adapter at its two choke points to accommodate drizzle.
  const colTypes = buildColTypes();
  (Pool as any).prototype.adaptQuery = function (this: any, query: any, values: any) {
    if (query && typeof query === "object" && query.types) {
      const { types: _types, ...rest } = query;
      query = rest;
    }
    const cfg = typeof query === "string" ? { text: query, values } : { ...query, values: query.values ?? values };
    const vals: unknown[] | undefined = cfg.values;
    if (vals && vals.length) {
      cfg.text = inlineParams(String(cfg.text), vals, colTypes);
      cfg.values = [];
    }
    return cfg;
  };
  const baseAdaptResults = (Pool as any).prototype.adaptResults;
  (Pool as any).prototype.adaptResults = function (this: any, query: any, res: any) {
    if (query && query.rowMode === "array") {
      const fields: Array<{ name: string }> = res.fields ?? [];
      const rows = Array.isArray(res.rows)
        ? res.rows.map((row: Record<string, unknown> | null) => (row == null ? row : fields.map((f) => row[f.name])))
        : res.rows;
      return { ...res, rows };
    }
    return baseAdaptResults.call(this, query, res);
  };

  for (const stmt of schemaDDL()) {
    mem.public.none(stmt);
  }
  const pool = new Pool();
  const db = drizzle(pool, { schema, casing: "snake_case" });
  return Promise.resolve({ mem, pool, db });
}

export function getTestDb(): Promise<TestDbBundle> {
  if (!bundlePromise) {
    bundlePromise = createBundle();
  }
  return bundlePromise;
}