import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../db';
import { authenticate } from '../middleware/auth';
import { PoolClient } from 'pg';

const router = Router();

router.use(authenticate);

// ─── Types ────────────────────────────────────────────────────────────────────
interface SaleItemPayload {
  product_id: number;
  quantity: number;
}

interface CreateSalePayload {
  items: SaleItemPayload[];
  payment_method: 'cash' | 'card' | 'other';
  amount_tendered?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateInvoiceNumber(): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `INV-${year}${month}${day}-${random}`;
}

// ─── POST /api/sales ──────────────────────────────────────────────────────────
// Accessible by: owner, manager, cashier
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { items, payment_method, amount_tendered }: CreateSalePayload = req.body;
  const cashierId = req.user!.userId;

  if (!items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ message: 'Cart is empty' });
    return;
  }

  if (!['cash', 'card', 'other'].includes(payment_method)) {
    res.status(400).json({ message: 'Invalid payment method' });
    return;
  }

  try {
    const result = await withTransaction(async (client: PoolClient) => {
      let subtotal = 0;
      const saleItemsToInsert = [];
      const inventoryUpdates = [];

      // We need to lock the rows in a consistent order to prevent deadlocks.
      // Sort product IDs in ascending order.
      const productIds = [...new Set(items.map(item => item.product_id))].sort((a, b) => a - b);

      // 1. Lock inventory rows for all products in the cart
      // We use UPSERT first to ensure inventory records exist before locking them.
      for (const pid of productIds) {
        await client.query(
          `INSERT INTO inventory (product_id, quantity) VALUES ($1, 0) ON CONFLICT (product_id) DO NOTHING`,
          [pid]
        );
      }

      // Lock inventory
      const invQuery = await client.query(
        `SELECT product_id, quantity FROM inventory WHERE product_id = ANY($1) FOR UPDATE`,
        [productIds]
      );
      const inventoryMap = new Map(invQuery.rows.map(row => [row.product_id, row.quantity]));

      // 2. Process each item, verify stock, and calculate totals using DB prices
      for (const item of items) {
        const qty = parseInt(item.quantity as any, 10);
        if (isNaN(qty) || qty <= 0) {
          throw Object.assign(new Error('Invalid quantity'), { statusCode: 400 });
        }

        // Fetch product details
        const prodQuery = await client.query(
          `SELECT id, name, selling_price, is_active FROM products WHERE id = $1`,
          [item.product_id]
        );

        if (prodQuery.rows.length === 0) {
          throw Object.assign(new Error(`Product ID ${item.product_id} not found`), { statusCode: 404 });
        }

        const product = prodQuery.rows[0];
        if (!product.is_active) {
          throw Object.assign(new Error(`Product "${product.name}" is inactive and cannot be sold`), { statusCode: 400 });
        }

        const currentStock = inventoryMap.get(item.product_id) || 0;
        if (currentStock < qty) {
          throw Object.assign(
            new Error(`Insufficient stock for "${product.name}". Available: ${currentStock}, Requested: ${qty}`),
            { statusCode: 400 }
          );
        }

        const unitPrice = parseFloat(product.selling_price);
        const lineTotal = unitPrice * qty;
        subtotal += lineTotal;

        saleItemsToInsert.push({
          product_id: product.id,
          product_name: product.name,
          quantity: qty,
          unit_price: unitPrice,
          line_total: lineTotal
        });

        inventoryUpdates.push({
          product_id: product.id,
          quantity_before: currentStock,
          quantity_after: currentStock - qty,
          quantity_change: -qty
        });
      }

      // 3. Calculate final totals (tax is 0 for now as per schema default, can be added later)
      const taxAmount = 0;
      const totalAmount = subtotal + taxAmount;

      const tendered = amount_tendered ? parseFloat(amount_tendered as any) : totalAmount;
      if (isNaN(tendered) || tendered < totalAmount) {
        throw Object.assign(new Error('Amount tendered is less than the total amount'), { statusCode: 400 });
      }
      const changeGiven = tendered - totalAmount;

      // 4. Create Sale
      const invoiceNumber = generateInvoiceNumber();
      const saleResult = await client.query(
        `INSERT INTO sales (invoice_number, cashier_id, subtotal, tax_amount, total_amount, status)
         VALUES ($1, $2, $3, $4, $5, 'completed')
         RETURNING *`,
        [invoiceNumber, cashierId, subtotal, taxAmount, totalAmount]
      );
      const sale = saleResult.rows[0];

      // 5. Create Sale Items, update inventory, and log adjustments
      for (const si of saleItemsToInsert) {
        await client.query(
          `INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, line_total)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [sale.id, si.product_id, si.product_name, si.quantity, si.unit_price, si.line_total]
        );
      }

      for (const inv of inventoryUpdates) {
        // Decrease inventory
        await client.query(
          `UPDATE inventory SET quantity = $1, updated_at = NOW() WHERE product_id = $2`,
          [inv.quantity_after, inv.product_id]
        );

        // Log adjustment
        await client.query(
          `INSERT INTO inventory_adjustments
             (product_id, adjusted_by, quantity_change, quantity_before, quantity_after, reason, reference_type, reference_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [inv.product_id, cashierId, inv.quantity_change, inv.quantity_before, inv.quantity_after, `Sale ${invoiceNumber}`, 'sale', sale.id]
        );
      }

      // 6. Create Payment
      const paymentResult = await client.query(
        `INSERT INTO payments (sale_id, method, amount_tendered, change_given)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [sale.id, payment_method, tendered, changeGiven]
      );

      // Return enriched sale object with payment details
      return {
        ...sale,
        change_given: changeGiven.toFixed(2),
        amount_tendered: tendered.toFixed(2),
        payment_method,
        payment: paymentResult.rows[0],
      };
    });

    res.status(201).json(result);
  } catch (err: any) {
    if (err?.statusCode) {
      res.status(err.statusCode).json({ message: err.message });
      return;
    }
    console.error('POST /sales error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── GET /api/sales ─────────────────────────────────────────────────────────
// Owner/Manager: all sales. Cashier: only their own.
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { userId, role } = req.user!;

  // Pagination
  const page  = Math.max(1, parseInt(req.query.page  as string, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
  const offset = (page - 1) * limit;

  // Filters
  const { date_from, date_to, payment_method, invoice_number } = req.query as Record<string, string>;

  // Build WHERE clauses
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  // Role enforcement — cashiers see only their own sales
  if (role === 'cashier') {
    conditions.push(`s.cashier_id = $${paramIdx++}`);
    params.push(userId);
  }

  if (date_from) {
    conditions.push(`s.created_at >= $${paramIdx++}`);
    params.push(date_from);
  }
  if (date_to) {
    // Include the full end day
    conditions.push(`s.created_at < ($${paramIdx++}::date + interval '1 day')`);
    params.push(date_to);
  }
  if (payment_method && ['cash', 'card', 'other'].includes(payment_method)) {
    conditions.push(`p.method = $${paramIdx++}`);
    params.push(payment_method);
  }
  if (invoice_number) {
    conditions.push(`s.invoice_number ILIKE $${paramIdx++}`);
    params.push(`%${invoice_number}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    // Count total matching rows
    const countParams = [...params];
    const countResult = await query(
      `SELECT COUNT(DISTINCT s.id) AS total
       FROM sales s
       LEFT JOIN payments p ON p.sale_id = s.id
       ${where}`,
      countParams
    );
    const total = parseInt(countResult.rows[0].total as string, 10);
    const total_pages = Math.ceil(total / limit);

    // Fetch paginated rows
    const dataParams = [...params, limit, offset];
    const dataResult = await query(
      `SELECT
         s.id,
         s.invoice_number,
         s.subtotal,
         s.tax_amount,
         s.total_amount,
         s.status,
         s.created_at,
         u.full_name  AS cashier_name,
         u.username   AS cashier_username,
         p.method     AS payment_method,
         p.amount_tendered,
         p.change_given,
         (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS item_count
       FROM sales s
       JOIN users u    ON u.id = s.cashier_id
       LEFT JOIN payments p ON p.sale_id = s.id
       ${where}
       ORDER BY s.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      dataParams
    );

    res.json({
      sales: dataResult.rows,
      pagination: { page, limit, total, total_pages },
    });
  } catch (err) {
    console.error('GET /sales error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── GET /api/sales/:id ──────────────────────────────────────────────────────
// Owner/Manager: any sale. Cashier: only their own.
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const { userId, role } = req.user!;
  const saleId = parseInt(req.params.id, 10);

  if (isNaN(saleId)) {
    res.status(400).json({ message: 'Invalid sale ID' });
    return;
  }

  try {
    // Fetch the sale with cashier and payment info
    const saleResult = await query(
      `SELECT
         s.id,
         s.invoice_number,
         s.subtotal,
         s.tax_amount,
         s.total_amount,
         s.status,
         s.notes,
         s.created_at,
         s.cashier_id,
         u.full_name  AS cashier_name,
         u.username   AS cashier_username,
         p.method     AS payment_method,
         p.amount_tendered,
         p.change_given
       FROM sales s
       JOIN users u    ON u.id = s.cashier_id
       LEFT JOIN payments p ON p.sale_id = s.id
       WHERE s.id = $1`,
      [saleId]
    );

    if (saleResult.rows.length === 0) {
      res.status(404).json({ message: 'Sale not found' });
      return;
    }

    const sale = saleResult.rows[0];

    // Cashier can only view their own sales
    if (role === 'cashier' && sale.cashier_id !== userId) {
      res.status(403).json({ message: 'Access denied' });
      return;
    }

    // Fetch sale items (using snapshot data — not current product info)
    const itemsResult = await query(
      `SELECT id, product_id, product_name, quantity, unit_price, line_total
       FROM sale_items
       WHERE sale_id = $1
       ORDER BY id ASC`,
      [saleId]
    );

    res.json({
      ...sale,
      items: itemsResult.rows,
    });
  } catch (err) {
    console.error('GET /sales/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;

