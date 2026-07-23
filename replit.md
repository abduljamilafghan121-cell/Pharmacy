# Pharmacy Management System

A full-stack pharmacy management system built as a pnpm monorepo.

## Stack

- **Frontend**: React 19, Vite, TailwindCSS v4, TanStack Query, Wouter (routing), shadcn/ui
- **Backend**: Node.js, Express, TypeScript, Pino (logging)
- **Database**: PostgreSQL via Drizzle ORM (Supabase in production)
- **API contract**: OpenAPI 3.1 spec → Orval codegen (typed client + Zod schemas)

## Monorepo layout

```
artifacts/
  api-server/   Express API server (entry: src/index.ts)
  web/          React frontend (entry: src/main.tsx)
  mockup-sandbox/ UI component sandbox (internal tooling)

lib/
  db/           Drizzle schema + migrations (lib/db/drizzle/)
  api-spec/     openapi.yaml + Orval codegen config
  api-client-react/ Generated TanStack Query hooks
  api-zod/      Generated Zod validation schemas

api/
  index.js      Vercel serverless function entry (re-exports pre-built Express bundle)
vercel.json     Vercel deployment configuration
```

## Key domain areas

| Area | API routes | DB schema |
|------|-----------|-----------|
| Auth / Users | `/api/auth/*` | `lib/db/src/schema/users.ts` |
| Medicines / Inventory | `/api/medicines/*` | `lib/db/src/schema/medicines.ts` |
| Categories | `/api/categories/*` | `lib/db/src/schema/categories.ts` |
| Suppliers | `/api/suppliers/*` | `lib/db/src/schema/suppliers.ts` |
| Patients | `/api/patients/*` | `lib/db/src/schema/patients.ts` |
| Prescriptions | `/api/prescriptions/*` | `lib/db/src/schema/prescriptions.ts` |
| Orders / Sales | `/api/orders/*` | `lib/db/src/schema/orders.ts` |
| Payments | `/api/payments/*` | `lib/db/src/schema/payments.ts` |
| Purchase Orders | `/api/purchase-orders/*` | `lib/db/src/schema/purchase-orders.ts` |
| Reports | `/api/reports/*` | (aggregation queries) |

## Deploying to Vercel + Supabase

### Step 1 — Apply the database schema to Supabase

Replit can't connect directly to Supabase, so apply the schema manually:

1. Open your Supabase project → **SQL Editor**
2. Paste the contents of **`lib/db/drizzle/0000_greedy_plazm.sql`** and run it
3. That creates all 11 tables, enums, and foreign keys

For future schema changes:
```bash
pnpm --filter @workspace/db run generate   # generates a new SQL file in lib/db/drizzle/
```
Then paste the new file into Supabase's SQL Editor.

### Step 2 — Push code to GitHub

Vercel deploys from a Git repository.

```bash
# If not already connected to GitHub:
git init && git remote add origin https://github.com/your-username/your-repo.git
git push -u origin main
```

### Step 3 — Create a Vercel project

1. Go to https://vercel.com → **Add New Project** → Import your GitHub repo
2. Vercel will detect `vercel.json` automatically — **leave all build settings as defaults**
3. Before deploying, add these **Environment Variables** in the Vercel project settings:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Your Supabase PostgreSQL connection string (same as `SUPABASE_DATABASE_URL`) |
| `JWT_SECRET` | Your JWT secret (same value as the `JWT_SECRET` Replit secret) |
| `NODE_ENV` | `production` |

4. Click **Deploy**

Vercel will:
- Install dependencies (`pnpm install`)
- Apply any pending DB migrations (`drizzle-kit migrate`)
- Bundle the Express API into a serverless function (`artifacts/api-server/dist/vercel.mjs`)
- Build the React frontend as static files (`artifacts/web/dist/public`)
- Route `/api/*` → serverless function, everything else → React SPA

### How routing works on Vercel

```
https://your-app.vercel.app/api/medicines  → Express serverless function
https://your-app.vercel.app/dashboard      → React SPA (index.html)
https://your-app.vercel.app/login          → React SPA (index.html)
```

## Running locally on Replit

The API server is configured via the "API Server" workflow (port 8080).
The web frontend is configured via the "artifacts/web: web" workflow (port 22333).

Environment variables needed:
- `DATABASE_URL` (Replit-managed or `SUPABASE_DATABASE_URL` to use Supabase)
- `JWT_SECRET`

## Updating the API

When you change the OpenAPI spec (`lib/api-spec/openapi.yaml`):

```bash
pnpm --filter @workspace/api-spec run generate   # regenerates lib/api-client-react + lib/api-zod
```

## User preferences

<!-- Agent: record user preferences here -->
