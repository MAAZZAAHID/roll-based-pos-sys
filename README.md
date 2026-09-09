# Retail POS

A full-stack Point of Sale system built with React + TypeScript + Tailwind CSS on the frontend and Node.js + Express + PostgreSQL on the backend.

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **Backend**: Node.js, Express, TypeScript
- **Database**: PostgreSQL (plain SQL, no ORM)

## Project Structure

```
retail-pos/
├── api/             # Vercel entry point for the Express API
├── frontend/        # React + Vite frontend
├── backend/         # Node.js + Express API source
├── database/       # SQL migrations and seed data
├── .env.example    # Environment variable template
└── README.md
```

## Setup

### 1. Database

Create a PostgreSQL database:

```sql
CREATE DATABASE retail_pos;
CREATE USER pos_user WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE retail_pos TO pos_user;
```

Run all migrations:

```bash
cd database
psql -U pos_user -d retail_pos -f migrate.sql
```

### 2. Install and build

```bash
npm install
# Copy .env.example to backend/.env and edit DATABASE_URL and JWT_SECRET
npm run build:backend
```

Start the API and frontend in separate terminals for local development:

```bash
cd backend
npm run dev
```

```bash
cd frontend
npm run dev
```

The Vite development server proxies `/api/*` to the local Express server. In production, Vercel serves both from the same domain; no `VITE_API_URL` is needed.

## Development credentials

No default credentials are provided in this repository. Configure a development or test account through an isolated environment.

## Roles

| Role    | Permissions                                              |
|---------|----------------------------------------------------------|
| Owner   | Full access including user management                    |
| Manager | Products, inventory, categories, sales, reports, POS     |
| Cashier | POS only, own sales history                              |
