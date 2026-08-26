# Retail POS

A full-stack Point of Sale system built with React + TypeScript + Tailwind CSS on the frontend and Node.js + Express + PostgreSQL on the backend.

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **Backend**: Node.js, Express, TypeScript
- **Database**: PostgreSQL (plain SQL, no ORM)

## Project Structure

```
retail-pos/
├── frontend/       # React + Vite frontend
├── backend/        # Node.js + Express API
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

### 2. Backend

```bash
cd backend
cp ../.env.example .env
# Edit .env with your DATABASE_URL and JWT_SECRET
npm install
npm run build
node dist/index.js
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

## Default Credentials

- **Username**: `owner`
- **Password**: `Admin@1234`

> ⚠️ Change the default password immediately after first login.

## Roles

| Role    | Permissions                                              |
|---------|----------------------------------------------------------|
| Owner   | Full access including user management                    |
| Manager | Products, inventory, categories, sales, reports, POS     |
| Cashier | POS only, own sales history                              |
