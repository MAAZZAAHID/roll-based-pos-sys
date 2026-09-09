-- Migration 011: add optional per-shop receipt footer text.
-- Logo and contact fields already exist on shops from migration 009.

BEGIN;

ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS receipt_footer VARCHAR(500);

COMMIT;
