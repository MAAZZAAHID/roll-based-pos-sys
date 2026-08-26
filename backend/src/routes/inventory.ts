import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../db';
import { authenticate, authorize } from '../middleware/auth';
import { PoolClient } from 'pg';

const router = Router();

// All inventory routes require authentication
router.use(authenticate);

// ─── GET /api/inventory ───────────────────────────────────────────────────────
// Accessible by: owner, manager, cashier
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT
         p.id           AS product_id,
         p.name         AS product_name,
         p.barcode,
         p.low_stock_threshold,
         p.is_active    AS product_active,
         c.name         AS category_name,
         COALESCE(i.quantity, 0) AS quantity,
         CASE
           WHEN COALESCE(i.quantity, 0) = 0                          THEN 'Out of Stock'
           WHEN COALESCE(i.quantity, 0) <= p.low_stock_threshold     THEN 'Low Stock'
           ELSE 'In Stock'
         END AS status,
         i.updated_at
       FROM products p
       LEFT JOIN categories c      ON c.id = p.category_id
       LEFT JOIN inventory  i      ON i.product_id = p.id
       WHERE p.is_active = TRUE
       ORDER BY p.name ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /inventory error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── GET /api/inventory/:productId ───────────────────────────────────────────
// Accessible by: owner, manager, cashier
router.get('/:productId', async (req: Request, res: Response): Promise<void> => {
  const productId = parseInt(req.params.productId, 10);
  if (isNaN(productId)) {
    res.status(400).json({ message: 'Invalid product ID' });
    return;
  }

  try {
    const result = await query(
      `SELECT
         p.id           AS product_id,
         p.name         AS product_name,
         p.barcode,
         p.low_stock_threshold,
         c.name         AS category_name,
         COALESCE(i.quantity, 0) AS quantity,
         CASE
           WHEN COALESCE(i.quantity, 0) = 0                          THEN 'Out of Stock'
           WHEN COALESCE(i.quantity, 0) <= p.low_stock_threshold     THEN 'Low Stock'
           ELSE 'In Stock'
         END AS status,
         i.updated_at
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN inventory  i ON i.product_id = p.id
       WHERE p.id = $1`,
      [productId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ message: 'Product not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /inventory/:productId error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── POST /api/inventory/:productId/adjust ────────────────────────────────────
// Only owner and manager can adjust stock
router.post(
  '/:productId/adjust',
  authorize('owner', 'manager'),
  async (req: Request, res: Response): Promise<void> => {
    const productId = parseInt(req.params.productId, 10);
    if (isNaN(productId)) {
      res.status(400).json({ message: 'Invalid product ID' });
      return;
    }

    const { quantity_change, reason } = req.body;

    // Validate inputs
    const change = parseInt(quantity_change, 10);
    if (isNaN(change) || change === 0) {
      res.status(400).json({ message: 'quantity_change must be a non-zero integer' });
      return;
    }

    if (!reason || typeof reason !== 'string' || reason.trim() === '') {
      res.status(400).json({ message: 'Reason is required for inventory adjustments' });
      return;
    }

    const userId = req.user!.userId;

    try {
      const result = await withTransaction(async (client: PoolClient) => {
        // 1. Verify product exists
        const productCheck = await client.query(
          'SELECT id FROM products WHERE id = $1',
          [productId]
        );
        if (productCheck.rows.length === 0) {
          throw Object.assign(new Error('Product not found'), { statusCode: 404 });
        }

        // 2. Lock the inventory row (or create if it doesn't exist yet)
        //    Use UPSERT to ensure inventory row exists, then lock it
        await client.query(
          `INSERT INTO inventory (product_id, quantity)
           VALUES ($1, 0)
           ON CONFLICT (product_id) DO NOTHING`,
          [productId]
        );

        // 3. SELECT ... FOR UPDATE to lock the row exclusively
        const invResult = await client.query(
          'SELECT quantity FROM inventory WHERE product_id = $1 FOR UPDATE',
          [productId]
        );

        const currentQty: number = invResult.rows[0].quantity;
        const newQty = currentQty + change;

        // 4. Reject if result would be negative
        if (newQty < 0) {
          throw Object.assign(
            new Error(`Cannot reduce stock below zero. Current: ${currentQty}, Requested change: ${change}`),
            { statusCode: 400 }
          );
        }

        // 5. Update inventory
        await client.query(
          'UPDATE inventory SET quantity = $1, updated_at = NOW() WHERE product_id = $2',
          [newQty, productId]
        );

        // 6. Insert inventory_adjustments record (movement log)
        const movResult = await client.query(
          `INSERT INTO inventory_adjustments
             (product_id, adjusted_by, quantity_change, quantity_before, quantity_after, reason, reference_type)
           VALUES ($1, $2, $3, $4, $5, $6, 'manual')
           RETURNING *`,
          [productId, userId, change, currentQty, newQty, reason.trim()]
        );

        return {
          product_id:        productId,
          quantity_before:   currentQty,
          quantity_after:    newQty,
          quantity_change:   change,
          reason:            reason.trim(),
          movement:          movResult.rows[0],
        };
      });

      res.status(200).json(result);
    } catch (err: any) {
      if (err?.statusCode) {
        res.status(err.statusCode).json({ message: err.message });
        return;
      }
      console.error('POST /inventory/:productId/adjust error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// ─── GET /api/inventory/:productId/movements ──────────────────────────────────
// Owner and manager only — cashier does not need movement audit trail
router.get(
  '/:productId/movements',
  authorize('owner', 'manager'),
  async (req: Request, res: Response): Promise<void> => {
    const productId = parseInt(req.params.productId, 10);
    if (isNaN(productId)) {
      res.status(400).json({ message: 'Invalid product ID' });
      return;
    }

    try {
      // Verify product exists
      const productCheck = await query('SELECT id FROM products WHERE id = $1', [productId]);
      if (productCheck.rows.length === 0) {
        res.status(404).json({ message: 'Product not found' });
        return;
      }

      const result = await query(
        `SELECT
           ia.id,
           ia.product_id,
           ia.quantity_change,
           ia.quantity_before,
           ia.quantity_after,
           ia.reason,
           ia.reference_type,
           ia.reference_id,
           ia.created_at,
           u.username      AS adjusted_by_username,
           u.full_name     AS adjusted_by_name
         FROM inventory_adjustments ia
         JOIN users u ON u.id = ia.adjusted_by
         WHERE ia.product_id = $1
         ORDER BY ia.created_at DESC`,
        [productId]
      );

      res.json(result.rows);
    } catch (err) {
      console.error('GET /inventory/:productId/movements error:', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

export default router;
