# Retail POS — Deployment Guide

This document outlines the deployment configuration for the Retail POS system.

## Architecture Overview

- **Frontend:** React + TypeScript + Vite (Deployed to Vercel)
- **Backend:** Node.js + Express + TypeScript (Deployed to Render)
- **Database:** Neon PostgreSQL

---

## 1. Database (Neon PostgreSQL)

The database is hosted on Neon PostgreSQL. The schema and initial data are already applied. No further database configuration is required.

**Warning:** Do not share or commit the database credentials.

---

## 2. Backend (Render)

The backend is a Node.js REST API built with Express.

### Build & Start Commands

- **Build Command:** `npm run build` (This runs `tsc` to compile TypeScript to `dist/`)
- **Start Command:** `npm start` (This runs `node dist/index.js`)
- **Root Directory:** `backend`

### Environment Variables

Configure the following environment variables in the Render dashboard:

- `PORT`: (Render will set this automatically, e.g., `10000`)
- `DATABASE_URL`: Your Neon PostgreSQL connection string (e.g., `postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require`)
- `JWT_SECRET`: A long, cryptographically secure random string used to sign session tokens.
- `CORS_ORIGIN`: The public URL of the deployed Vercel frontend (e.g., `https://your-frontend.vercel.app`). Do not include a trailing slash.

### Health Check

To verify the backend is running and connected to the database, Render or external monitoring tools can access:

`GET /api/health`

This endpoint returns a `200 OK` status with `{"status": "ok"}` when healthy and does not expose any sensitive information.

---

## 3. Frontend (Vercel)

The frontend is a React application built with Vite.

### Build Settings

- **Framework Preset:** Vite
- **Build Command:** `npm run build` (This runs `tsc -b && vite build`)
- **Output Directory:** `dist`
- **Root Directory:** `frontend`

### Environment Variables

Configure the following environment variable in the Vercel dashboard:

- `VITE_API_URL`: The public URL of the deployed Render backend (e.g., `https://your-backend.onrender.com/api`). Do not include a trailing slash.

**Warning:** Never place `DATABASE_URL` or `JWT_SECRET` in the frontend environment variables.
