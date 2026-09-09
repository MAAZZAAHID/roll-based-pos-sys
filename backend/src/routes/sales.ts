import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../db';
import { authenticate } from '../middleware/auth';
import { PoolClient } from 'pg';
import { createHash } from 'crypto';

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

interface NormalizedSaleItem {
  product_id: number;
  quantity: number;
}

const IDEMPOTENCY_UNIQUE_INDEX = 'uq_sales_shop_idempotency_key';

interface RefundItemPayload {
  sale_item_id: number;
  quantity: number;
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

function readIdempotencyKey(req: Request): string {
  const raw = req.get('Idempotency-Key');
  const key = raw?.trim();
  if (!key || key.length > 255 || /[\u0000-\u001F\u007F]/.test(key)) {
    throw Object.assign(new Error('A valid Idempotency-Key header is required'), { statusCode: 400 });
  }
  return key;
}

function normalizeSaleItems(items: unknown): NormalizedSaleItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw Object.assign(new Error('Cart is empty'), { statusCode: 400 });
  }

  const mergedItems = new Map<number, number>();
  for (const item of items as Array<Partial<NormalizedSaleItem>>) {
    const productId = Number(item.product_id);
    const quantity = Number(item.quantity);
    if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity <= 0) {
      throw Object.assign(new Error('Product ID and quantity must be positive integers'), { statusCode: 400 });
    }
    mergedItems.set(productId, (mergedItems.get(productId) || 0) + quantity);
  }

  return Array.from(mergedItems, ([product_id, quantity]) => ({ product_id, quantity }))
    .sort((a, b) => a.product_id - b.product_id);
}

function parseNonNegativeDecimal(value: unknown, label: string): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw Object.assign(new Error(`${label} must be a valid non-negative number`), { statusCode: 400 });
    }
    return value;
  }
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value.trim())) {
    throw Object.assign(new Error(`${label} must be a valid non-negative number`), { statusCode: 400 });
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw Object.assign(new Error(`${label} must be a valid non-negative number`), { statusCode: 400 });
  }
  return numeric;
}

function moneyForFingerprint(value: number | string): string {
  return parseNonNegativeDecimal(value, 'Amount tendered').toFixed(2);
}

function effectiveAmountTendered(rawAmount: unknown, totalAmount: number | string): number {
  return rawAmount !== undefined && rawAmount !== null && rawAmount !== ''
    ? parseNonNegativeDecimal(rawAmount, 'Amount tendered')
    : parseNonNegativeDecimal(totalAmount, 'Amount tendered');
}

function hashSaleRequest(
  items: NormalizedSaleItem[],
  paymentMethod: CreateSalePayload['payment_method'],
  amountTendered: number | string
): string {
  const canonical = JSON.stringify({
    items,
    payment_method: paymentMethod,
    amount_tendered: moneyForFingerprint(amountTendered),
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

async function loadSaleResponse(client: PoolClient, saleId: number, shopId: number) {
  const saleResult = await client.query(
    `SELECT * FROM sales WHERE id = $1 AND shop_id = $2`,
    [saleId, shopId]
  );
  if (saleResult.rows.length === 0) {
    throw new Error('Idempotent sale result is unavailable');
  }

  const saleItemsResult = await client.query(
    `SELECT id, product_id, product_name, quantity, unit_price, line_total
     FROM sale_items WHERE sale_id = $1 ORDER BY id ASC`,
    [saleId]
  );

  const paymentResult = await client.query(
    `SELECT * FROM payments WHERE sale_id = $1 ORDER BY id DESC LIMIT 1`,
    [saleId]
  );
  if (paymentResult.rows.length === 0) {
    throw new Error('Idempotent sale payment is unavailable');
  }

  const payment = paymentResult.rows[0];
  return {
    ...saleResult.rows[0],
    change_given: payment.change_given,
    amount_tendered: payment.amount_tendered,
    payment_method: payment.method,
    payment,
    items: saleItemsResult.rows,
  };
}

// ─── POST /api/sales ──────────────────────────────────────────────────────────
// Accessible by: owner, manager, cashier
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { items, payment_method, amount_tendered }: CreateSalePayload = req.body;
  const cashierId = req.user!.userId;
  let idempotencyKey: string;

  if (!items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ message: 'Cart is empty' });
    return;
  }

  if (!['cash', 'card', 'other'].includes(payment_method)) {
    res.status(400).json({ message: 'Invalid payment method' });
    return;
  }

  try {
    idempotencyKey = readIdempotencyKey(req);
    const normalizedItems = normalizeSaleItems(items);

    const result = await withTransaction(async (client: PoolClient) => {
      const existingResult = await client.query(
        `SELECT id, total_amount, idempotency_request_hash
         FROM sales
         WHERE shop_id = $1 AND idempotency_key = $2`,
        [req.user!.shopId, idempotencyKey]
      );

      if (existingResult.rows.length > 0) {
        const existing = existingResult.rows[0];
        const existingHash = hashSaleRequest(
          normalizedItems,
          payment_method,
          effectiveAmountTendered(amount_tendered, existing.total_amount)
        );
        if (existing.idempotency_request_hash !== existingHash) {
          throw Object.assign(new Error('Idempotency key was already used for a different sale request'), { statusCode: 409 });
        }
        return { replayed: true, sale: await loadSaleResponse(client, existing.id, req.user!.shopId) };
      }

      let subtotal = 0;
      const saleItemsToInsert = [];
      const inventoryUpdates = [];
      const productDetails = [];

      // Read authoritative product data before claiming the idempotency key.
      // Stock is deliberately checked only after the claim so a concurrent
      // retry can replay a committed sale before current inventory is considered.
      for (const item of normalizedItems) {
        const prodQuery = await client.query(
          `SELECT id, name, selling_price, is_active FROM products WHERE id = $1 AND shop_id = $2`,
          [item.product_id, req.user!.shopId]
        );

        if (prodQuery.rows.length === 0) {
          throw Object.assign(new Error(`Product ID ${item.product_id} not found`), { statusCode: 404 });
        }

        const product = prodQuery.rows[0];
        if (!product.is_active) {
          throw Object.assign(new Error(`Product "${product.name}" is inactive and cannot be sold`), { statusCode: 400 });
        }

        const unitPrice = parseFloat(product.selling_price);
        const lineTotal = unitPrice * item.quantity;
        subtotal += lineTotal;
        productDetails.push({ item, product, unitPrice, lineTotal });
      }

      // Calculate totals and claim the sale before any inventory failure can
      // prevent a concurrent request from replaying a committed sale.
      const taxAmount = 0;
      const totalAmount = subtotal + taxAmount;
      const tendered = effectiveAmountTendered(amount_tendered, totalAmount);
      if (isNaN(tendered) || tendered < totalAmount) {
        throw Object.assign(new Error('Amount tendered is less than the total amount'), { statusCode: 400 });
      }
      const changeGiven = tendered - totalAmount;
      const requestHash = hashSaleRequest(normalizedItems, payment_method, tendered);

      // Create Sale / idempotency claim
      const invoiceNumber = generateInvoiceNumber();
      await client.query('SAVEPOINT sale_idempotency_insert');
      let saleResult;
      try {
        saleResult = await client.query(
          `INSERT INTO sales
             (shop_id, invoice_number, cashier_id, subtotal, tax_amount, total_amount, status, idempotency_key, idempotency_request_hash)
           VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7, $8)
           RETURNING *`,
          [req.user!.shopId, invoiceNumber, cashierId, subtotal, taxAmount, totalAmount, idempotencyKey, requestHash]
        );
        await client.query('RELEASE SAVEPOINT sale_idempotency_insert');
      } catch (err: any) {
        await client.query('ROLLBACK TO SAVEPOINT sale_idempotency_insert');
        if (err?.code !== '23505' || err?.constraint !== IDEMPOTENCY_UNIQUE_INDEX) {
          throw err;
        }

        const concurrentResult = await client.query(
          `SELECT id, idempotency_request_hash
           FROM sales
           WHERE shop_id = $1 AND idempotency_key = $2`,
          [req.user!.shopId, idempotencyKey]
        );
        if (concurrentResult.rows.length === 0) {
          throw err;
        }

        const concurrent = concurrentResult.rows[0];
        if (concurrent.idempotency_request_hash !== requestHash) {
          throw Object.assign(new Error('Idempotency key was already used for a different sale request'), { statusCode: 409 });
        }
        await client.query('RELEASE SAVEPOINT sale_idempotency_insert');
        return { replayed: true, sale: await loadSaleResponse(client, concurrent.id, req.user!.shopId) };
      }
      const sale = saleResult.rows[0];

      // We need to lock the rows in a consistent order to prevent deadlocks.
      // Sort product IDs in ascending order.
      const productIds = normalizedItems.map(item => item.product_id).sort((a, b) => a - b);

      // 1. Lock inventory rows for all products in the cart
      // We use UPSERT first to ensure inventory records exist before locking them.
      for (const pid of productIds) {
        await client.query(
          `INSERT INTO inventory (product_id, quantity) SELECT id, 0 FROM products WHERE id = $1 AND shop_id = $2 ON CONFLICT (product_id) DO NOTHING`,
          [pid, req.user!.shopId]
        );
      }

      // Lock inventory
      const invQuery = await client.query(
        `SELECT i.product_id, i.quantity FROM inventory i JOIN products p ON p.id = i.product_id WHERE i.product_id = ANY($1) AND p.shop_id = $2 FOR UPDATE`,
        [productIds, req.user!.shopId]
      );
      const inventoryMap = new Map(invQuery.rows.map(row => [row.product_id, row.quantity]));

      // Verify stock only after the claim. Any failure rolls back the claim.
      for (const detail of productDetails) {
        const qty = detail.item.quantity;
        const currentStock = inventoryMap.get(detail.item.product_id) || 0;
        if (currentStock < qty) {
          throw Object.assign(
            new Error(`Insufficient stock for "${detail.product.name}". Available: ${currentStock}, Requested: ${qty}`),
            { statusCode: 400 }
          );
        }

        saleItemsToInsert.push({
          product_id: detail.product.id,
          product_name: detail.product.name,
          quantity: qty,
          unit_price: detail.unitPrice,
          line_total: detail.lineTotal
        });

        inventoryUpdates.push({
          product_id: detail.product.id,
          quantity_before: currentStock,
          quantity_after: currentStock - qty,
          quantity_change: -qty
        });
      }

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
        replayed: false,
        sale: {
        ...sale,
        change_given: changeGiven.toFixed(2),
        amount_tendered: tendered.toFixed(2),
        payment_method,
        payment: paymentResult.rows[0],
        },
      };
    });

    if (result.replayed) res.setHeader('Idempotent-Replay', 'true');
    res.status(result.replayed ? 200 : 201).json(result.sale);
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

  conditions.push(`s.shop_id = $${paramIdx++}`);
  params.push(req.user!.shopId);

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

  const where = `WHERE ${conditions.join(' AND ')}`;

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
       WHERE s.id = $1 AND s.shop_id = $2`,
      [saleId, req.user!.shopId]
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

// ─── POST /api/sales/:id/refund ─────────────────────────────────────────────
// Owner/Manager: refund all or part of a completed sale and restore stock.
router.post('/:id/refund', async (req: Request, res: Response): Promise<void> => {
  const { role, userId } = req.user!;
  if (role !== 'owner' && role !== 'manager') {
    res.status(403).json({ message: 'Only owners and managers can process refunds' });
    return;
  }

  const saleId = parseInt(req.params.id, 10);
  const { items, reason, method } = req.body as { items: RefundItemPayload[]; reason: string; method?: 'cash' | 'card' | 'other' };
  if (isNaN(saleId) || !Array.isArray(items) || items.length === 0 || typeof reason !== 'string' || !reason.trim()) {
    res.status(400).json({ message: 'Sale ID, refund items, and reason are required' });
    return;
  }
  if (method !== undefined && !['cash', 'card', 'other'].includes(method)) {
    res.status(400).json({ message: 'Invalid refund method' });
    return;
  }

  try {
    const result = await withTransaction(async (client: PoolClient) => {
      const saleResult = await client.query(`SELECT id, status FROM sales WHERE id = $1 AND shop_id = $2 FOR UPDATE`, [saleId, req.user!.shopId]);
      if (saleResult.rows.length === 0) throw Object.assign(new Error('Sale not found'), { statusCode: 404 });
      if (saleResult.rows[0].status !== 'completed') throw Object.assign(new Error('Only completed sales can be refunded'), { statusCode: 400 });

      const saleItemsResult = await client.query(
        `SELECT si.id, si.product_id, si.quantity, si.unit_price,
                COALESCE(SUM(ri.quantity), 0) AS refunded_quantity
         FROM sale_items si
         JOIN products p ON p.id = si.product_id AND p.shop_id = $2
         LEFT JOIN refund_items ri ON ri.sale_item_id = si.id
         WHERE si.sale_id = $1
         GROUP BY si.id`, [saleId, req.user!.shopId]
      );
      const itemMap = new Map(saleItemsResult.rows.map(item => [item.id, item]));
      const requested = new Map<number, number>();
      for (const item of items) {
        if (!Number.isInteger(item.sale_item_id) || !Number.isInteger(item.quantity) || item.quantity <= 0) {
          throw Object.assign(new Error('Refund quantities must be positive integers'), { statusCode: 400 });
        }
        requested.set(item.sale_item_id, (requested.get(item.sale_item_id) || 0) + item.quantity);
      }

      let amount = 0;
      const refundRows: Array<{ saleItemId: number; productId: number; quantity: number; unitPrice: number; lineTotal: number }> = [];
      for (const [saleItemId, quantity] of requested) {
        const saleItem = itemMap.get(saleItemId);
        if (!saleItem || quantity > saleItem.quantity - Number(saleItem.refunded_quantity)) {
          throw Object.assign(new Error('Refund quantity exceeds the remaining sold quantity'), { statusCode: 400 });
        }
        const unitPrice = Number(saleItem.unit_price);
        const lineTotal = unitPrice * quantity;
        amount += lineTotal;
        refundRows.push({ saleItemId, productId: saleItem.product_id, quantity, unitPrice, lineTotal });
      }

      const refundResult = await client.query(
        `INSERT INTO refunds (sale_id, refunded_by, amount, method, reason) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [saleId, userId, amount, method || 'cash', reason.trim()]
      );
      const refund = refundResult.rows[0];

      for (const row of refundRows) {
        await client.query(
          `INSERT INTO refund_items (refund_id, sale_item_id, product_id, quantity, unit_price, line_total) VALUES ($1, $2, $3, $4, $5, $6)`,
          [refund.id, row.saleItemId, row.productId, row.quantity, row.unitPrice, row.lineTotal]
        );
        await client.query(`INSERT INTO inventory (product_id, quantity) VALUES ($1, 0) ON CONFLICT (product_id) DO NOTHING`, [row.productId]);
        const inventoryResult = await client.query(`SELECT quantity FROM inventory WHERE product_id = $1 FOR UPDATE`, [row.productId]);
        const before = inventoryResult.rows[0].quantity;
        const after = before + row.quantity;
        await client.query(`UPDATE inventory SET quantity = $1, updated_at = NOW() WHERE product_id = $2`, [after, row.productId]);
        await client.query(
          `INSERT INTO inventory_adjustments (product_id, adjusted_by, quantity_change, quantity_before, quantity_after, reason, reference_type, reference_id) VALUES ($1, $2, $3, $4, $5, $6, 'refund', $7)`,
          [row.productId, userId, row.quantity, before, after, `Refund for sale ${saleId}: ${reason.trim()}`, refund.id]
        );
      }

      const remainingResult = await client.query(
        `SELECT COUNT(*) AS remaining FROM sale_items si LEFT JOIN refund_items ri ON ri.sale_item_id = si.id WHERE si.sale_id = $1 GROUP BY si.id HAVING si.quantity > COALESCE(SUM(ri.quantity), 0)`, [saleId]
      );
      if (remainingResult.rows.length === 0) await client.query(`UPDATE sales SET status = 'refunded' WHERE id = $1`, [saleId]);
      await client.query(
        `INSERT INTO audit_logs (shop_id, user_id, action, entity_type, entity_id, new_values, ip_address) VALUES ($1, $2, 'sale.refunded', 'sale', $3, $4, $5)`,
        [req.user!.shopId, userId, saleId, JSON.stringify({ refund_id: refund.id, amount, reason: reason.trim() }), req.ip || null]
      );
      return refund;
    });
    res.status(201).json(result);
  } catch (err: any) {
    if (err?.statusCode) { res.status(err.statusCode).json({ message: err.message }); return; }
    console.error('POST /sales/:id/refund error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
