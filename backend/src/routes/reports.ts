import { Router, Request, Response } from 'express';
import { query } from '../db';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Only owner and manager can access reports
router.use(authenticate);
router.use(authorize('owner', 'manager'));

// ─── GET /api/reports/dashboard ───────────────────────────────────────────────
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Today's Sales & Transactions
    const todaySalesRes = await query(
      `SELECT
         COALESCE(SUM(total_amount), 0) AS total_sales,
         COUNT(id) AS transactions
       FROM sales
       WHERE created_at >= $1::date AND created_at < ($1::date + interval '1 day')`,
      [todayStr]
    );
    const todaySales = parseFloat(todaySalesRes.rows[0].total_sales as string);
    const todayTransactions = parseInt(todaySalesRes.rows[0].transactions as string, 10);
    const todayAvg = todayTransactions > 0 ? todaySales / todayTransactions : 0;

    // 2. Inventory Stats
    const invStatsRes = await query(
      `SELECT
         COUNT(p.id) AS active_products,
         SUM(CASE WHEN i.quantity <= p.low_stock_threshold AND i.quantity > 0 THEN 1 ELSE 0 END) AS low_stock,
         SUM(CASE WHEN i.quantity <= 0 THEN 1 ELSE 0 END) AS out_of_stock
       FROM products p
       LEFT JOIN inventory i ON i.product_id = p.id
       WHERE p.is_active = TRUE`
    );
    const invStats = {
      active_products: parseInt(invStatsRes.rows[0].active_products as string, 10) || 0,
      low_stock: parseInt(invStatsRes.rows[0].low_stock as string, 10) || 0,
      out_of_stock: parseInt(invStatsRes.rows[0].out_of_stock as string, 10) || 0,
    };

    // 3. Recent Sales (Latest 5)
    const recentSalesRes = await query(
      `SELECT
         s.id, s.invoice_number, s.total_amount, s.created_at,
         u.full_name AS cashier_name,
         p.method AS payment_method
       FROM sales s
       JOIN users u ON u.id = s.cashier_id
       LEFT JOIN payments p ON p.sale_id = s.id
       ORDER BY s.created_at DESC
       LIMIT 5`
    );

    // 4. Best-Selling Products (Today)
    const topProductsRes = await query(
      `SELECT
         si.product_name,
         SUM(si.quantity) AS quantity_sold
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       WHERE s.created_at >= $1::date AND s.created_at < ($1::date + interval '1 day')
       GROUP BY si.product_id, si.product_name
       ORDER BY quantity_sold DESC
       LIMIT 5`,
      [todayStr]
    );

    // 5. Low Stock Products (Max 5 for dashboard)
    const lowStockRes = await query(
      `SELECT p.name AS product_name, i.quantity, p.low_stock_threshold
       FROM products p
       JOIN inventory i ON i.product_id = p.id
       WHERE p.is_active = TRUE AND i.quantity <= p.low_stock_threshold
       ORDER BY i.quantity ASC
       LIMIT 5`
    );

    res.json({
      today: {
        sales: todaySales,
        transactions: todayTransactions,
        average_sale: todayAvg
      },
      inventory: invStats,
      recent_sales: recentSalesRes.rows,
      top_products: topProductsRes.rows,
      low_stock_products: lowStockRes.rows
    });
  } catch (err) {
    console.error('GET /reports/dashboard error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── GET /api/reports/sales ───────────────────────────────────────────────────
router.get('/sales', async (req: Request, res: Response) => {
  const { date_from, date_to } = req.query as Record<string, string>;
  
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (date_from) {
    conditions.push(`s.created_at >= $${paramIdx++}`);
    params.push(date_from);
  }
  if (date_to) {
    conditions.push(`s.created_at < ($${paramIdx++}::date + interval '1 day')`);
    params.push(date_to);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const summaryRes = await query(
      `SELECT
         COALESCE(SUM(s.total_amount), 0) AS total_sales,
         COUNT(DISTINCT s.id) AS transactions
       FROM sales s
       ${where}`,
      params
    );
    const totalSales = parseFloat(summaryRes.rows[0].total_sales as string);
    const transactions = parseInt(summaryRes.rows[0].transactions as string, 10);
    const avgSale = transactions > 0 ? totalSales / transactions : 0;

    const paymentRes = await query(
      `SELECT p.method, COALESCE(SUM(s.total_amount), 0) AS amount
       FROM sales s
       JOIN payments p ON p.sale_id = s.id
       ${where}
       GROUP BY p.method`,
      params
    );

    const paymentTotals = { cash: 0, card: 0, other: 0 };
    for (const row of paymentRes.rows) {
      if (row.method === 'cash' || row.method === 'card' || row.method === 'other') {
         paymentTotals[row.method] = parseFloat(row.amount as string);
      }
    }

    res.json({
      total_sales: totalSales,
      transactions,
      average_sale: avgSale,
      payment_totals: paymentTotals
    });
  } catch (err) {
    console.error('GET /reports/sales error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── GET /api/reports/top-products ────────────────────────────────────────────
router.get('/top-products', async (req: Request, res: Response) => {
  const { date_from, date_to, limit } = req.query as Record<string, string>;
  
  const parsedLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (date_from) {
    conditions.push(`s.created_at >= $${paramIdx++}`);
    params.push(date_from);
  }
  if (date_to) {
    conditions.push(`s.created_at < ($${paramIdx++}::date + interval '1 day')`);
    params.push(date_to);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(parsedLimit);

  try {
    const topProductsRes = await query(
      `SELECT
         si.product_name,
         SUM(si.quantity) AS quantity_sold,
         SUM(si.line_total) AS revenue
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       ${where}
       GROUP BY si.product_id, si.product_name
       ORDER BY quantity_sold DESC, revenue DESC
       LIMIT $${paramIdx}`,
      params
    );

    res.json(topProductsRes.rows.map(row => ({
      product_name: row.product_name,
      quantity_sold: parseInt(row.quantity_sold as string, 10),
      revenue: parseFloat(row.revenue as string)
    })));
  } catch (err) {
    console.error('GET /reports/top-products error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── GET /api/reports/low-stock ───────────────────────────────────────────────
router.get('/low-stock', async (req: Request, res: Response) => {
  try {
    const lowStockRes = await query(
      `SELECT
         p.id AS product_id,
         p.name AS product_name,
         p.barcode,
         i.quantity AS current_quantity,
         p.low_stock_threshold,
         CASE
           WHEN i.quantity <= 0 THEN 'Out of Stock'
           ELSE 'Low Stock'
         END AS status
       FROM products p
       JOIN inventory i ON i.product_id = p.id
       WHERE p.is_active = TRUE AND i.quantity <= p.low_stock_threshold
       ORDER BY i.quantity ASC, p.name ASC`
    );
    res.json(lowStockRes.rows);
  } catch (err) {
    console.error('GET /reports/low-stock error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
