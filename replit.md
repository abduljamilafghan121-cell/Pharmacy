# Pharmacy Management System

A full-stack pharmacy management system built as a pnpm monorepo.

## Stack

- **Frontend**: React 19, Vite, TailwindCSS v4, TanStack Query, Wouter (routing), shadcn/ui
- **Backend**: Node.js, Express, TypeScript, Pino (logging)
- **Database**: PostgreSQL via Drizzle ORM
- **API contract**: OpenAPI 3.1 spec → Orval codegen (typed client + Zod schemas)

## Monorepo layout

```
artifacts/
  api-server/   Express API server (entry: src/index.ts)
  web/          React frontend (entry: src/main.tsx)
  mockup-sandbox/ UI component sandbox (internal tooling)

lib/
  db/           Drizzle schema + migrations
  api-spec/     openapi.yaml + Orval codegen config
  api-client-react/ Generated TanStack Query hooks
  api-zod/      Generated Zod validation schemas
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

## Running locally on Replit

The project needs a PostgreSQL database before it can run. To get it fully running:

1. Provision a Replit PostgreSQL database (the `DATABASE_URL` secret must be set)
2. Run migrations: `pnpm --filter @workspace/db run db:push`
3. Start the API server: `PORT=8080 pnpm --filter @workspace/api-server run dev`
4. Start the web frontend: `pnpm --filter @workspace/web run dev`

## User preferences

<!-- Agent: record user preferences here -->
