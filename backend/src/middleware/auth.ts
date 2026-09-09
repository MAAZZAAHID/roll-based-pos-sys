import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Role = 'owner' | 'manager' | 'cashier';

export interface JwtPayload {
  userId: number;
  username: string;
  role: Role;
  shopId: number;
}

// Augment Express Request to carry the authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// ─── Token helpers ────────────────────────────────────────────────────────────

export function signToken(payload: JwtPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');

  const expiresIn = (process.env.JWT_EXPIRES_IN || '8h') as jwt.SignOptions['expiresIn'];

  return jwt.sign(payload, secret, { expiresIn });
}

// ─── Middleware: authenticate ─────────────────────────────────────────────────

/**
 * Verify the JWT in the Authorization header.
 * Attaches the decoded payload to req.user.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ message: 'Server configuration error' });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as JwtPayload;
    const userResult = await query<{ id: number; username: string; is_active: boolean; role: string; shop_id: number }>(
      `SELECT u.id, u.username, u.is_active, r.name AS role
       , u.shop_id
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
      [payload.userId]
    );
    if (userResult.rows.length === 0 || !userResult.rows[0].is_active) {
      res.status(401).json({ message: 'User account is inactive or unavailable' });
      return;
    }
    req.user = { userId: userResult.rows[0].id, username: userResult.rows[0].username, role: userResult.rows[0].role as Role, shopId: userResult.rows[0].shop_id };
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}

// ─── Middleware: authorize ────────────────────────────────────────────────────

/**
 * Role hierarchy: owner > manager > cashier
 * Use authorize('owner') to restrict to owners only.
 * Use authorize('manager') to allow owner + manager.
 * Use authorize('cashier') to allow all three roles.
 */
const ROLE_RANK: Record<Role, number> = {
  owner:   3,
  manager: 2,
  cashier: 1,
};

export function authorize(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const userRank = ROLE_RANK[req.user.role] ?? 0;
    const hasPermission = allowedRoles.some(
      (role) => userRank >= ROLE_RANK[role]
    );

    if (!hasPermission) {
      res.status(403).json({
        message: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
      });
      return;
    }

    next();
  };
}
