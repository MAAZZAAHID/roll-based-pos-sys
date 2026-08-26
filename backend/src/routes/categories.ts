import { Router, Request, Response } from 'express';
import { query } from '../db';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// ─── GET /api/categories ──────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT id, name, description, is_active, created_at, updated_at
       FROM categories
       ORDER BY id ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /categories error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── GET /api/categories/:id ──────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ message: 'Invalid category ID' });
    return;
  }

  try {
    const result = await query(
      `SELECT id, name, description, is_active, created_at, updated_at
       FROM categories WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ message: 'Category not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /categories/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── POST /api/categories (Owner/Manager only) ────────────────────────────────
router.post('/', authorize('owner', 'manager'), async (req: Request, res: Response): Promise<void> => {
  const { name, description, is_active } = req.body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ message: 'Category name is required and cannot be empty' });
    return;
  }

  try {
    // Check for duplicate category name
    const duplicateCheck = await query('SELECT id FROM categories WHERE name = $1', [name.trim()]);
    if (duplicateCheck.rows.length > 0) {
      res.status(409).json({ message: 'Category name already exists' });
      return;
    }

    const insertResult = await query(
      `INSERT INTO categories (name, description, is_active)
       VALUES ($1, $2, $3)
       RETURNING id, name, description, is_active, created_at, updated_at`,
      [name.trim(), description || null, is_active !== undefined ? is_active : true]
    );

    res.status(201).json(insertResult.rows[0]);
  } catch (err) {
    console.error('POST /categories error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── PUT /api/categories/:id (Owner/Manager only) ─────────────────────────────
router.put('/:id', authorize('owner', 'manager'), async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ message: 'Invalid category ID' });
    return;
  }

  const { name, description, is_active } = req.body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ message: 'Category name is required and cannot be empty' });
    return;
  }

  try {
    // Check for duplicate category name on other IDs
    const duplicateCheck = await query(
      'SELECT id FROM categories WHERE name = $1 AND id != $2',
      [name.trim(), id]
    );
    if (duplicateCheck.rows.length > 0) {
      res.status(409).json({ message: 'Category name already exists' });
      return;
    }

    const updateResult = await query(
      `UPDATE categories
       SET name = $1, description = $2, is_active = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING id, name, description, is_active, created_at, updated_at`,
      [name.trim(), description || null, is_active !== undefined ? is_active : true, id]
    );

    if (updateResult.rows.length === 0) {
      res.status(404).json({ message: 'Category not found' });
      return;
    }

    res.json(updateResult.rows[0]);
  } catch (err) {
    console.error('PUT /categories/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── DELETE /api/categories/:id (Owner/Manager only) ──────────────────────────
router.delete('/:id', authorize('owner', 'manager'), async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ message: 'Invalid category ID' });
    return;
  }

  try {
    // Note: Do not hard delete to avoid foreign key violations with products
    // Alternatively, we could soft delete (set is_active = false)
    const result = await query(
      'UPDATE categories SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ message: 'Category not found' });
      return;
    }

    res.json({ message: 'Category deactivated successfully' });
  } catch (err) {
    console.error('DELETE /categories/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
