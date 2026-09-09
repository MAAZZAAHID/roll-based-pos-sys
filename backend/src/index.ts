import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { query } from './db';
import authRouter from './routes/auth';
import usersRouter from './routes/users';
import categoriesRouter from './routes/categories';
import productsRouter from './routes/products';
import inventoryRoutes from './routes/inventory';
import salesRoutes from './routes/sales';
import reportsRoutes from './routes/reports';
import shopRouter from './routes/shop';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Same-origin deployments do not need CORS. Set CORS_ORIGIN for direct local clients.
const rawOrigin = process.env.CORS_ORIGIN;
if (rawOrigin) {
  const allowedOrigins = rawOrigin.split(',').map(o => o.trim()).filter(Boolean);
  const corsOrigin = allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins;
  app.use(cors({ origin: corsOrigin, credentials: true }));
}
// Branding uploads use bounded base64 image data URLs; keep the request limit
// finite while allowing the validated logo payload through.
app.use(express.json({ limit: '1mb' }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/products', productsRouter);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/shop', shopRouter);

// ─── Health check ─────────────────────────────────────────────────────────────
// No auth required. Returns minimal info only — no DB names, credentials, or internals.
app.get('/api/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Health check DB error:', err);
    res.status(503).json({ status: 'error', message: 'Database connection failed' });
  }
});

// ─── 404 Not Found Handler ────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ message: 'Not Found' });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Internal server error' });
});

// ─── Start server ─────────────────────────────────────────────────────────────
// Bind to 0.0.0.0 so cloud hosting platforms can route traffic.
// We conditionally start the server to prevent port binding issues in Vercel's
// Serverless environment, while preserving local 'npm start' functionality.
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(Number(port), '0.0.0.0', () => {
    console.log(`✅  Backend server running on port ${port}`);
    console.log(`    Health:  GET  http://localhost:${port}/api/health`);
    console.log(`    Login:   POST http://localhost:${port}/api/auth/login`);
    console.log(`    Me:      GET  http://localhost:${port}/api/auth/me`);
  });
}

// Export the Express app instance for Vercel Serverless Functions
export default app;
