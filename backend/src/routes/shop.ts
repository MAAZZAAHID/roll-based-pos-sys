import { Router, Request, Response } from 'express';
import { query } from '../db';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT id, name, logo_url, show_logo, show_name, phone, address, receipt_footer, currency, created_at, updated_at
       FROM shops WHERE id = $1`, [req.user!.shopId]
    );
    if (!result.rows.length) { res.status(404).json({ message: 'Shop not found' }); return; }
    res.json(result.rows[0]);
  } catch (err) {
    // Keep existing shop settings usable until migration 011 is applied.
    if ((err as { code?: string }).code === '42703') {
      try {
        const legacyResult = await query(
          `SELECT id, name, logo_url, show_logo, show_name, phone, address, NULL::text AS receipt_footer, currency, created_at, updated_at
           FROM shops WHERE id = $1`, [req.user!.shopId]
        );
        if (!legacyResult.rows.length) { res.status(404).json({ message: 'Shop not found' }); return; }
        res.json(legacyResult.rows[0]);
        return;
      } catch (legacyErr) {
        console.error('GET /shop legacy fallback error:', legacyErr);
      }
    }
    console.error('GET /shop error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/', authorize('owner'), async (req: Request, res: Response) => {
  const { name, logo_url, show_logo, show_name, phone, address, receipt_footer, currency } = req.body as Record<string, unknown>;
  if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.trim().length > 255)) {
    res.status(400).json({ message: 'Shop name cannot be empty' }); return;
  }
  if (phone !== undefined && phone !== null && (typeof phone !== 'string' || phone.length > 50)) {
    res.status(400).json({ message: 'Phone must be 50 characters or fewer' }); return;
  }
  if (address !== undefined && address !== null && (typeof address !== 'string' || address.length > 1000)) {
    res.status(400).json({ message: 'Address must be 1000 characters or fewer' }); return;
  }
  if (receipt_footer !== undefined && receipt_footer !== null && (typeof receipt_footer !== 'string' || receipt_footer.length > 500)) {
    res.status(400).json({ message: 'Receipt footer must be 500 characters or fewer' }); return;
  }
  if (logo_url !== undefined && logo_url !== null) {
    const logo = typeof logo_url === 'string' ? logo_url : '';
    const dataUrl = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(logo);
    const remoteUrl = /^https?:\/\/[^\s]{1,2040}$/i.test(logo);
    if (logo.length > 700000 || (!dataUrl && !remoteUrl)) {
      res.status(400).json({ message: 'Logo must be a supported image upload or HTTPS/HTTP image URL' }); return;
    }
  }
  if (show_logo !== undefined && typeof show_logo !== 'boolean') {
    res.status(400).json({ message: 'show_logo must be a boolean' }); return;
  }
  if (show_name !== undefined && typeof show_name !== 'boolean') {
    res.status(400).json({ message: 'show_name must be a boolean' }); return;
  }
  try {
    const result = await query(
      `UPDATE shops SET
         name = COALESCE($1, name), logo_url = $2,
         show_logo = COALESCE($3, show_logo), show_name = COALESCE($4, show_name),
         phone = $5, address = $6, receipt_footer = $7, currency = COALESCE($8, currency), updated_at = NOW()
       WHERE id = $9
       RETURNING id, name, logo_url, show_logo, show_name, phone, address, receipt_footer, currency, updated_at`,
      [name === undefined ? null : name.trim(), logo_url ?? null, show_logo ?? null, show_name ?? null, phone ?? null, address ?? null, receipt_footer ?? null, currency ?? null, req.user!.shopId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    if ((err as { code?: string }).code === '42703') {
      if (receipt_footer !== undefined && receipt_footer !== null && String(receipt_footer).trim()) {
        res.status(503).json({ message: 'Receipt footer requires migration 011 before it can be saved' });
        return;
      }
      try {
        const legacyResult = await query(
          `UPDATE shops SET
             name = COALESCE($1, name), logo_url = $2,
             show_logo = COALESCE($3, show_logo), show_name = COALESCE($4, show_name),
             phone = $5, address = $6, currency = COALESCE($7, currency), updated_at = NOW()
           WHERE id = $8
           RETURNING id, name, logo_url, show_logo, show_name, phone, address, NULL::text AS receipt_footer, currency, updated_at`,
          [name === undefined ? null : name.trim(), logo_url ?? null, show_logo ?? null, show_name ?? null, phone ?? null, address ?? null, currency ?? null, req.user!.shopId]
        );
        res.json(legacyResult.rows[0]);
        return;
      } catch (legacyErr) {
        console.error('PUT /shop legacy fallback error:', legacyErr);
      }
    }
    console.error('PUT /shop error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
