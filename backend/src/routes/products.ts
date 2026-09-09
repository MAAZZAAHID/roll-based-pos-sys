import { Router, Request, Response } from 'express';
import { query } from '../db';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate);

function strictDecimal(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function strictNonNegativeInteger(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0 ? value : null;
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

// ─── GET /api/products ────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT p.id, p.name, p.barcode, p.category_id, p.selling_price, p.cost_price, 
              p.low_stock_threshold, p.is_active, p.created_at, p.updated_at,
              c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id AND c.shop_id = p.shop_id
       WHERE p.shop_id = $1
       ORDER BY p.id ASC`, [req.user!.shopId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /products error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── GET /api/products/:id ────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ message: 'Invalid product ID' });
    return;
  }

  try {
    const result = await query(
      `SELECT p.id, p.name, p.barcode, p.category_id, p.selling_price, p.cost_price, 
              p.low_stock_threshold, p.is_active, p.created_at, p.updated_at,
              c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id AND c.shop_id = p.shop_id
       WHERE p.id = $1 AND p.shop_id = $2`,
      [id, req.user!.shopId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ message: 'Product not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /products/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── POST /api/products (Owner/Manager only) ──────────────────────────────────
router.post('/', authorize('owner', 'manager'), async (req: Request, res: Response): Promise<void> => {
  let { name, barcode, category_id, selling_price, cost_price, low_stock_threshold, is_active } = req.body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ message: 'Product name is required' });
    return;
  }
  
  const sellPrice = strictDecimal(selling_price);
  const costPrice = strictDecimal(cost_price);

  if (sellPrice === null || sellPrice < 0) {
    res.status(400).json({ message: 'Selling price must be a valid positive number' });
    return;
  }
  if (costPrice === null || costPrice < 0) {
    res.status(400).json({ message: 'Cost price must be a valid positive number' });
    return;
  }

  const threshold = low_stock_threshold !== undefined ? strictNonNegativeInteger(low_stock_threshold) : 10;
  if (threshold === null || threshold < 0) {
    res.status(400).json({ message: 'Low stock threshold must be a valid positive integer' });
    return;
  }

  const finalBarcode = (typeof barcode === 'string' && barcode.trim() !== '') ? barcode.trim() : null;

  try {
    // Check for duplicate barcode
    if (finalBarcode) {
        const duplicateCheck = await query('SELECT id FROM products WHERE shop_id = $1 AND barcode = $2', [req.user!.shopId, finalBarcode]);
      if (duplicateCheck.rows.length > 0) {
        res.status(409).json({ message: 'Barcode already exists' });
        return;
      }
    }

    // Validate category exists if provided
    let catId = null;
    if (category_id) {
      catId = strictNonNegativeInteger(category_id);
      if (catId === null) {
        res.status(400).json({ message: 'Invalid category ID' });
        return;
      }
        const catCheck = await query('SELECT id FROM categories WHERE id = $1 AND shop_id = $2 AND is_active = TRUE', [catId, req.user!.shopId]);
      if (catCheck.rows.length === 0) {
        res.status(400).json({ message: 'Category not found' });
        return;
      }
    }

    const insertResult = await query(
      `INSERT INTO products (shop_id, name, barcode, category_id, selling_price, cost_price, low_stock_threshold, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, barcode, category_id, selling_price, cost_price, low_stock_threshold, is_active, created_at, updated_at`,
        [req.user!.shopId, name.trim(), finalBarcode, catId, sellPrice, costPrice, threshold, is_active !== undefined ? is_active : true]
    );

    res.status(201).json(insertResult.rows[0]);
  } catch (err) {
    console.error('POST /products error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── PUT /api/products/:id (Owner/Manager only) ───────────────────────────────
router.put('/:id', authorize('owner', 'manager'), async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ message: 'Invalid product ID' });
    return;
  }

  let { name, barcode, category_id, selling_price, cost_price, low_stock_threshold, is_active } = req.body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ message: 'Product name is required' });
    return;
  }
  
  const sellPrice = strictDecimal(selling_price);
  const costPrice = strictDecimal(cost_price);

  if (sellPrice === null || sellPrice < 0) {
    res.status(400).json({ message: 'Selling price must be a valid positive number' });
    return;
  }
  if (costPrice === null || costPrice < 0) {
    res.status(400).json({ message: 'Cost price must be a valid positive number' });
    return;
  }

  const threshold = low_stock_threshold !== undefined ? strictNonNegativeInteger(low_stock_threshold) : 10;
  if (threshold === null || threshold < 0) {
    res.status(400).json({ message: 'Low stock threshold must be a valid positive integer' });
    return;
  }

  const finalBarcode = (typeof barcode === 'string' && barcode.trim() !== '') ? barcode.trim() : null;

  try {
    // Check for duplicate barcode on other products
    if (finalBarcode) {
      const duplicateCheck = await query(
        'SELECT id FROM products WHERE shop_id = $1 AND barcode = $2 AND id != $3',
        [req.user!.shopId, finalBarcode, id]
      );
      if (duplicateCheck.rows.length > 0) {
        res.status(409).json({ message: 'Barcode already exists' });
        return;
      }
    }

    // Validate category exists if provided
    let catId = null;
    if (category_id) {
      catId = strictNonNegativeInteger(category_id);
      if (catId === null) {
        res.status(400).json({ message: 'Invalid category ID' });
        return;
      }
      const catCheck = await query('SELECT id FROM categories WHERE id = $1 AND shop_id = $2 AND is_active = TRUE', [catId, req.user!.shopId]);
      if (catCheck.rows.length === 0) {
        res.status(400).json({ message: 'Category not found' });
        return;
      }
    }

    const currentThreshold = await query('SELECT low_stock_threshold FROM products WHERE id = $1 AND shop_id = $2', [id, req.user!.shopId]);
    const effectiveThreshold = low_stock_threshold !== undefined
      ? threshold
      : currentThreshold.rows[0]?.low_stock_threshold ?? 10;

    const updateResult = await query(
      `UPDATE products
       SET name = $1, barcode = $2, category_id = $3, selling_price = $4, cost_price = $5, low_stock_threshold = $6, is_active = $7, updated_at = NOW()
       WHERE id = $8 AND shop_id = $9
       RETURNING id, name, barcode, category_id, selling_price, cost_price, low_stock_threshold, is_active, created_at, updated_at`,
        [name.trim(), finalBarcode, catId, sellPrice, costPrice, effectiveThreshold, is_active !== undefined ? is_active : true, id, req.user!.shopId]
    );

    if (updateResult.rows.length === 0) {
      res.status(404).json({ message: 'Product not found' });
      return;
    }

    res.json(updateResult.rows[0]);
  } catch (err) {
    console.error('PUT /products/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── DELETE /api/products/:id (Owner/Manager only) ────────────────────────────
router.delete('/:id', authorize('owner', 'manager'), async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ message: 'Invalid product ID' });
    return;
  }

  try {
    // Soft delete to avoid breaking sales history/inventory relationships
    const result = await query(
      'UPDATE products SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND shop_id = $2 RETURNING id',
      [id, req.user!.shopId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ message: 'Product not found' });
      return;
    }

    res.json({ message: 'Product deactivated successfully' });
  } catch (err) {
    console.error('DELETE /products/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
