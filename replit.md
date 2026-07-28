# Pharmacy Management System

A full-stack pharmacy management web application for managing medicines, patients, sales, prescriptions, suppliers, and reports.

## Stack

- **Frontend**: React 19, Vite, Tailwind CSS, shadcn/ui, Wouter (routing), TanStack Query
- **Backend**: Express 5, TypeScript, JWT auth, Pino logging
- **Database**: PostgreSQL via Drizzle ORM
- **Monorepo**: pnpm workspaces

## Project Structure

```
artifacts/
  web/           — React frontend (@workspace/web)
  api-server/    — Express API server (@workspace/api-server)
  mockup-sandbox/— UI component preview sandbox

lib/
  db/            — Drizzle ORM schema + database client (@workspace/db)
  api-zod/       — Shared Zod validation schemas (@workspace/api-zod)
  api-client-react/ — Generated API client hooks (@workspace/api-client-react)
  api-spec/      — OpenAPI spec + Orval codegen config (@workspace/api-spec)
```

## Running the App

### Prerequisites

Set one of these environment secrets before starting:
- `DATABASE_URL` — PostgreSQL connection string (Replit managed DB)
- `SUPABASE_DATABASE_URL` — Supabase PostgreSQL connection string

`SESSION_SECRET` is already configured.

### Start workflows

- **API Server** (`artifacts/api-server`): `PORT=8080 pnpm --filter @workspace/api-server run dev`
- **Web App** (`artifacts/web`): `pnpm --filter @workspace/web run dev`

### Database setup

After configuring the database URL, run migrations:

```bash
pnpm --filter @workspace/db run push
```

## Key Features

- Login / Register / Role-based access control
- Dashboard with sales and inventory overview
- Medicine inventory management (batches, units, categories)
- Patient records and prescription tracking
- Sales (orders) with cart and cash register
- Supplier management and purchase orders
- Supplier ledger and returns
- Insurance claims
- Reports and audit logs
- Multi-user with admin and staff roles

## User Preferences

(None recorded yet)
