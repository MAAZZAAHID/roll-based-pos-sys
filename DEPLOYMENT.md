# Retail POS - Deployment Guide

The Retail POS frontend and API deploy together as one Vercel Services project
with one shared domain.

## Architecture Overview

- **Frontend service:** `frontend/`, React + TypeScript + Vite (built to `dist`)
- **Backend service:** `backend/`, Express + TypeScript (served by `api/index.ts`)
- **Database:** Neon PostgreSQL

---

## 1. Database (Neon PostgreSQL)

The database is hosted on Neon PostgreSQL. The schema and initial data are already applied. No further database configuration is required.

**Warning:** Do not share or commit the database credentials.

---

## 2. Vercel project

Create or configure one Vercel project for the repository root. Set its Framework
Preset to **Services**. The root `vercel.json` defines both services and routes
them on the same deployment:

- `/api/(.*)` → the `backend` service
- `/(.*)` → the `frontend` service

The frontend therefore uses the same production origin for API requests, and
direct browser navigation to routes such as `/dashboard` and `/pos` remains on
the frontend service.

### Build Settings

- **Root Directory:** repository root
- **Framework Preset:** Services
- **Frontend service:** root `frontend/`, framework `vite`, build command `npm run build`, output `dist`
- **Backend service:** root `backend/`, framework `express`, entrypoint `api/index.ts`
- **Install Command:** `npm install`

### Environment Variables

Configure these environment variables in the Vercel dashboard:

- `DATABASE_URL`: Your Neon PostgreSQL connection string.
- `JWT_SECRET`: A long, cryptographically secure random string used to sign session tokens.
- `JWT_EXPIRES_IN`: Optional JWT lifetime; defaults to `8h`.
- `CORS_ORIGIN`: Backend origin allowlist for local/separate frontend access.

Configure these variables on the single Vercel project. `DATABASE_URL`,
`JWT_SECRET`, and `JWT_EXPIRES_IN` are server-side values used by the backend;
they are not frontend `VITE_*` variables. `CORS_ORIGIN` is optional for direct
local clients and is not required for same-origin browser requests. Never place
database credentials or JWT secrets in frontend environment variables. Keep
`.env` files local/uncommitted.

### Local development

Run the backend and frontend separately:

```bash
npm run dev --workspace backend
npm run dev --workspace frontend -- --host 127.0.0.1
```

The Vite development server proxies `/api/*` to `http://localhost:3001`.

## Multi-shop migration and tenant security

Run `database/migrate.sql` once against the existing database before starting the multi-shop build. Migration 009 creates the shared `shops` table, adopts existing records into Shop 1, and adds indexed `shop_id` foreign keys without dropping data. The backend derives tenant context from the authenticated user and scopes all tenant-owned API queries; clients cannot select a shop by submitting `shop_id`.

PostgreSQL RLS is intentionally staged rather than enabled blindly: the current pooled server connection does not yet establish a per-request database role/session variable safely. Backend tenant enforcement is the active control. A future RLS migration should use a transaction-local, server-set tenant variable on every checked-out connection and include policies for every tenant-owned table before enabling enforcement.

### Health Check

`GET /api/health` returns `200 OK` with `{"status":"ok"}` when PostgreSQL is reachable.
