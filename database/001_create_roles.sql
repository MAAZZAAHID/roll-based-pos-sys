-- Migration 001: Create roles table
CREATE TABLE IF NOT EXISTS roles (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default roles (safe to re-run — ON CONFLICT does nothing)
INSERT INTO roles (name, description) VALUES
  ('owner',   'Full system access including user management'),
  ('manager', 'Access to products, inventory, reports, and POS'),
  ('cashier', 'Access to POS and own sales history only')
ON CONFLICT (name) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_roles_name ON roles (name);
