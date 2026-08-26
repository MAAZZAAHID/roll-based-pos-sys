import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { query } from '../db';
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
              u.is_active, r.name AS role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.username = $1
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
    });

    res.json({
      token,
      user: {
        id:       user.id,
        username: user.username,
        email:    user.email,
        fullName: user.full_name,
        role:     user.role_name,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

router.get('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await query<UserRow>(
      `SELECT u.id, u.username, u.email, u.full_name, u.is_active, r.name AS role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1`,
      [req.user!.userId]
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
    });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
