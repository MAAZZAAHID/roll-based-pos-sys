import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { query } from '../db';
import { authenticate, authorize, Role } from '../middleware/auth';

const router = Router();

// Secure all routes: only owner
router.use(authenticate);
router.use(authorize('owner'));

// ─── Helper: write an audit log entry ─────────────────────────────────────────
async function auditLog(
  actorId: number,
  action: string,
  entityId: number,
  oldValues?: object | null,
  newValues?: object | null,
  ip?: string
) {
  try {
    await query(
      `INSERT INTO audit_logs (shop_id, user_id, action, entity_type, entity_id, old_values, new_values, ip_address)
       VALUES ((SELECT shop_id FROM users WHERE id = $1), $1, $2, 'user', $3, $4, $5, $6)`,
      [actorId, action, entityId, oldValues ? JSON.stringify(oldValues) : null, newValues ? JSON.stringify(newValues) : null, ip || null]
    );
  } catch (e) {
    // Audit failures must never break the main operation
    console.error('Audit log error:', e);
  }
}

// Safe user columns — never includes password_hash
const SAFE_COLS = `u.id, u.username, u.email, u.full_name, u.is_active, u.created_at, r.name AS role`;

// ─── GET /api/users ───────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT ${SAFE_COLS}
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.shop_id = $1
       ORDER BY u.created_at DESC, u.id DESC`, [req.user!.shopId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /users error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── GET /api/users/:id ───────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    res.status(400).json({ message: 'Invalid user ID' });
    return;
  }

  try {
    const result = await query(
      `SELECT ${SAFE_COLS}
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1 AND u.shop_id = $2`,
      [userId, req.user!.shopId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /users/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── POST /api/users ──────────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { username, email, password, full_name, role } = req.body;

  // Validation
  if (!username || !password || !role) {
    res.status(400).json({ message: 'username, password, and role are required' });
    return;
  }

  const VALID_ROLES: Role[] = ['owner', 'manager', 'cashier'];
  if (!VALID_ROLES.includes(role)) {
    res.status(400).json({ message: `Invalid role. Allowed: ${VALID_ROLES.join(', ')}` });
    return;
  }

  if (typeof username !== 'string' || username.trim().length < 3) {
    res.status(400).json({ message: 'Username must be at least 3 characters' });
    return;
  }

  if (typeof password !== 'string' || password.length < 6) {
    res.status(400).json({ message: 'Password must be at least 6 characters' });
    return;
  }

  try {
    // Duplicate username check
    const dupCheck = await query(
      'SELECT id FROM users WHERE shop_id = $1 AND username = $2',
      [req.user!.shopId, username.trim().toLowerCase()]
    );
    if (dupCheck.rows.length > 0) {
      res.status(409).json({ message: 'Username already exists' });
      return;
    }

    // If email provided, check it too
    if (email) {
      const emailDup = await query('SELECT id FROM users WHERE shop_id = $1 AND email = $2', [req.user!.shopId, email.trim().toLowerCase()]);
      if (emailDup.rows.length > 0) {
        res.status(409).json({ message: 'Email already in use' });
        return;
      }
    }

    // Resolve role_id
    const roleCheck = await query('SELECT id FROM roles WHERE name = $1', [role]);
    if (roleCheck.rows.length === 0) {
      res.status(400).json({ message: 'Invalid role' });
      return;
    }
    const roleId = roleCheck.rows[0].id;

    // Hash password — never store plaintext
    const password_hash = await bcrypt.hash(String(password), 12);

    // Use placeholder email when none provided (schema requires NOT NULL)
    const effectiveEmail = email ? email.trim().toLowerCase() : `${username.trim().toLowerCase()}@store.local`;
    const effectiveFullName = (full_name && full_name.trim()) ? full_name.trim() : username.trim();

    const insertResult = await query(
      `INSERT INTO users (shop_id, username, email, password_hash, full_name, role_id, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       RETURNING id, username, email, full_name, is_active, created_at`,
      [req.user!.shopId, username.trim().toLowerCase(), effectiveEmail, password_hash, effectiveFullName, roleId]
    );

    const newUser = { ...(insertResult.rows[0] as { id: number; username: string; email: string | null; full_name: string | null; is_active: boolean; created_at: string }), role };

    // Audit log — no password in new_values
    await auditLog(req.user!.userId, 'user.created', newUser.id, null, { username: newUser.username, role }, req.ip);

    res.status(201).json(newUser);
  } catch (err) {
    console.error('POST /users error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── PUT /api/users/:id ───────────────────────────────────────────────────────
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    res.status(400).json({ message: 'Invalid user ID' });
    return;
  }

  const { username, email, full_name, role, is_active } = req.body;

  const VALID_ROLES: Role[] = ['owner', 'manager', 'cashier'];
  if (role !== undefined && !VALID_ROLES.includes(role)) {
    res.status(400).json({ message: `Invalid role. Allowed: ${VALID_ROLES.join(', ')}` });
    return;
  }

  try {
    // Fetch current user state first
    const currentRes = await query(
      `SELECT u.id, u.username, u.email, u.full_name, u.is_active, r.name AS role
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1 AND u.shop_id = $2`,
      [userId, req.user!.shopId]
    );
    if (currentRes.rows.length === 0) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    const current = currentRes.rows[0];

    // Self-protection: prevent deactivating or demoting the last active owner
    const isTargetOwner = current.role === 'owner';
    const isDemoting = role !== undefined && role !== 'owner';
    const isDeactivating = is_active === false;

    if (isTargetOwner && (isDemoting || isDeactivating)) {
      const activeOwnerCountRes = await query(
        `SELECT COUNT(u.id) AS count FROM users u
         JOIN roles r ON r.id = u.role_id
         WHERE r.name = 'owner' AND u.is_active = TRUE AND u.shop_id = $2 AND u.id != $1`,
        [userId, req.user!.shopId]
      );
      if (parseInt(activeOwnerCountRes.rows[0].count as string, 10) === 0) {
        res.status(403).json({ message: 'Cannot deactivate or demote the last active owner' });
        return;
      }
    }

    // Duplicate username check (excluding self)
    if (username !== undefined) {
      const dupCheck = await query(
        'SELECT id FROM users WHERE shop_id = $1 AND username = $2 AND id != $3',
        [req.user!.shopId, username.trim().toLowerCase(), userId]
      );
      if (dupCheck.rows.length > 0) {
        res.status(409).json({ message: 'Username already exists' });
        return;
      }
    }

    // Duplicate email check (excluding self)
    if (email !== undefined && email !== null && email !== '') {
      const emailDup = await query(
        'SELECT id FROM users WHERE shop_id = $1 AND email = $2 AND id != $3',
        [req.user!.shopId, email.trim().toLowerCase(), userId]
      );
      if (emailDup.rows.length > 0) {
        res.status(409).json({ message: 'Email already in use' });
        return;
      }
    }

    // Resolve role_id if role is changing
    let roleId: number | undefined;
    if (role !== undefined) {
      const roleCheck = await query('SELECT id FROM roles WHERE name = $1', [role]);
      if (roleCheck.rows.length === 0) {
        res.status(400).json({ message: 'Invalid role' });
        return;
      }
      roleId = roleCheck.rows[0].id as number;
    }

    // Build dynamic UPDATE
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (username !== undefined) { setClauses.push(`username = $${idx++}`); params.push(username.trim().toLowerCase()); }
    if (email !== undefined)    { setClauses.push(`email = $${idx++}`);    params.push(email && email.trim() ? email.trim().toLowerCase() : `${current.username}@store.local`); }
    if (full_name !== undefined){ setClauses.push(`full_name = $${idx++}`);params.push(full_name && full_name.trim() ? full_name.trim() : current.username); }
    if (roleId !== undefined)   { setClauses.push(`role_id = $${idx++}`);  params.push(roleId); }
    if (is_active !== undefined){ setClauses.push(`is_active = $${idx++}`);params.push(is_active); }

    if (setClauses.length === 0) {
      res.status(400).json({ message: 'No fields to update' });
      return;
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(userId, req.user!.shopId);

    const updateResult = await query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${idx} AND shop_id = $${idx + 1} RETURNING id, username, email, full_name, is_active, created_at`,
      params
    );

    const finalRole = role || current.role;
    const updatedRow = updateResult.rows[0] as { id: number; username: string; email: string | null; full_name: string | null; is_active: boolean; created_at: string };
    const updatedUser = { ...updatedRow, role: finalRole };

    // Audit log
    await auditLog(req.user!.userId, 'user.updated', userId,
      { username: current.username as string, role: current.role as string, is_active: current.is_active as boolean },
      { username: updatedUser.username, role: finalRole, is_active: updatedUser.is_active },
      req.ip
    );

    res.json(updatedUser);
  } catch (err) {
    console.error('PUT /users/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── PUT /api/users/:id/password ─────────────────────────────────────────────
router.put('/:id/password', async (req: Request, res: Response): Promise<void> => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    res.status(400).json({ message: 'Invalid user ID' });
    return;
  }

  const { password } = req.body;

  if (!password || typeof password !== 'string' || password.length < 6) {
    res.status(400).json({ message: 'New password must be at least 6 characters' });
    return;
  }

  try {
    // Verify user exists
    const userCheck = await query('SELECT id FROM users WHERE id = $1 AND shop_id = $2', [userId, req.user!.shopId]);
    if (userCheck.rows.length === 0) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    // Hash new password — never store plaintext
    const password_hash = await bcrypt.hash(password, 12);

    await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 AND shop_id = $3',
      [password_hash, userId, req.user!.shopId]
    );

    // Audit log — no password stored
    await auditLog(req.user!.userId, 'user.password_reset', userId, null, { reset_by: req.user!.userId }, req.ip);

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('PUT /users/:id/password error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── DELETE /api/users/:id ────────────────────────────────────────────────────
// Soft delete only — preserves historical sales and audit records
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    res.status(400).json({ message: 'Invalid user ID' });
    return;
  }

  try {
    // Fetch target to check role
    const userRes = await query(
      `SELECT u.id, u.is_active, r.name AS role FROM users u
       JOIN roles r ON r.id = u.role_id WHERE u.id = $1 AND u.shop_id = $2`,
      [userId, req.user!.shopId]
    );
    if (userRes.rows.length === 0) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    const target = userRes.rows[0];

    // Self-protection: cannot deactivate the last active owner
    if (target.role === 'owner') {
      const activeOwnersCount = await query(
        `SELECT COUNT(u.id) AS count FROM users u
         JOIN roles r ON r.id = u.role_id
         WHERE r.name = 'owner' AND u.is_active = TRUE AND u.shop_id = $2 AND u.id != $1`,
        [userId, req.user!.shopId]
      );
      if (parseInt(activeOwnersCount.rows[0].count as string, 10) === 0) {
        res.status(403).json({ message: 'Cannot deactivate the last active owner' });
        return;
      }
    }

    // Soft delete
    await query(
      'UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND shop_id = $2',
      [userId, req.user!.shopId]
    );

    // Audit log
    await auditLog(req.user!.userId, 'user.deactivated', userId, { is_active: target.is_active }, { is_active: false }, req.ip);

    res.json({ message: 'User deactivated successfully' });
  } catch (err) {
    console.error('DELETE /users/:id error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
