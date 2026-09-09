import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { query, withTransaction } from '../db';
import { signToken, authenticate, Role } from '../middleware/auth';

const router = Router();

// ─── Row types ────────────────────────────────────────────────────────────────

interface UserRow {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  full_name: string;
  role_name: Role;
  is_active: boolean;
  shop_id: number;
}

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(400).json({ message: 'Username and password are required' });
    return;
  }

  try {
    // Look up user with role in a single query — no ORM, plain SQL
    const result = await query<UserRow>(
      `SELECT u.id, u.username, u.email, u.password_hash, u.full_name,
              u.is_active, u.shop_id, r.name AS role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE LOWER(u.username) = $1 OR LOWER(u.email) = $1
       LIMIT 1`,
      [username.trim().toLowerCase()]
    );

    const user = result.rows[0];

    // Constant-time comparison: always call bcrypt.compare even if user not found
    // to prevent timing-based username enumeration
    const dummyHash = '$2b$12$invalidhashfortimingprotectiononly000000000000000000000';
    const passwordMatch = await bcrypt.compare(
      password,
      user?.password_hash ?? dummyHash
    );

    if (!user || !passwordMatch) {
      res.status(401).json({ message: 'Invalid username or password' });
      return;
    }

    if (!user.is_active) {
      res.status(403).json({ message: 'Account is deactivated' });
      return;
    }

    const token = signToken({
      userId:   user.id,
      username: user.username,
      role:     user.role_name,
      shopId:   user.shop_id,
    });

    res.json({
      token,
      user: {
        id:       user.id,
        username: user.username,
        email:    user.email,
        fullName: user.full_name,
        role:     user.role_name,
        shopId:   user.shop_id,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/auth/create-shop - atomically creates a shop and its owner.
router.post('/create-shop', async (req: Request, res: Response): Promise<void> => {
  const { shopName, ownerName, ownerEmail, password, logoUrl } = req.body as {
    shopName?: string; ownerName?: string; ownerEmail?: string; password?: string; logoUrl?: string;
  };
  const name = shopName?.trim();
  const fullName = ownerName?.trim();
  const email = ownerEmail?.trim().toLowerCase();
  if (!name || !fullName || !email || !password) {
    res.status(400).json({ message: 'Shop name, owner name, email, and password are required' });
    return;
  }
  if (name.length < 2 || fullName.length < 2 || !/^\S+@\S+\.\S+$/.test(email)) {
    res.status(400).json({ message: 'Please provide valid shop and owner details' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ message: 'Password must be at least 8 characters' });
    return;
  }

  try {
    const result = await withTransaction(async (client) => {
      const existing = await client.query('SELECT id FROM users WHERE LOWER(email) = $1', [email]);
      if (existing.rows.length) throw Object.assign(new Error('Email already in use'), { statusCode: 409 });

      const shopResult = await client.query(
        `INSERT INTO shops (name, logo_url) VALUES ($1, $2) RETURNING id, name, logo_url, show_logo, show_name, currency`,
        [name, logoUrl?.trim() || null]
      );
      const shop = shopResult.rows[0];
      const baseUsername = email.split('@')[0].replace(/[^a-z0-9_]/gi, '').toLowerCase().slice(0, 40) || 'owner';
      const usernameResult = await client.query(
        `SELECT username FROM users WHERE username = $1 OR username LIKE $2 ORDER BY username DESC`,
        [baseUsername, `${baseUsername}%`]
      );
      const used = new Set(usernameResult.rows.map((row: { username: string }) => row.username));
      let username = baseUsername;
      let suffix = 1;
      while (used.has(username)) username = `${baseUsername.slice(0, 38)}${suffix++}`;
      const passwordHash = await bcrypt.hash(password, 12);
      const ownerResult = await client.query(
        `INSERT INTO users (shop_id, username, email, password_hash, full_name, role_id, is_active)
         VALUES ($1, $2, $3, $4, $5, (SELECT id FROM roles WHERE name = 'owner'), TRUE)
         RETURNING id, username, email, full_name`,
        [shop.id, username, email, passwordHash, fullName]
      );
      const owner = ownerResult.rows[0];
      return { shop, owner };
    });
    const token = signToken({ userId: result.owner.id, username: result.owner.username, role: 'owner', shopId: result.shop.id });
    res.status(201).json({
      token,
      shop: result.shop,
      user: { id: result.owner.id, username: result.owner.username, email: result.owner.email, fullName: result.owner.full_name, role: 'owner', shopId: result.shop.id },
    });
  } catch (err: any) {
    if (err?.statusCode) { res.status(err.statusCode).json({ message: err.message }); return; }
    console.error('Create shop error:', err);
    res.status(500).json({ message: 'Unable to create shop' });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

router.get('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await query<UserRow>(
      `SELECT u.id, u.username, u.email, u.full_name, u.is_active, u.shop_id, r.name AS role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1 AND u.shop_id = $2`,
      [req.user!.userId, req.user!.shopId]
    );

    const user = result.rows[0];

    if (!user || !user.is_active) {
      res.status(401).json({ message: 'User not found or deactivated' });
      return;
    }

    res.json({
      id:       user.id,
      username: user.username,
      email:    user.email,
      fullName: user.full_name,
      role:     user.role_name,
      shopId:   user.shop_id,
    });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
