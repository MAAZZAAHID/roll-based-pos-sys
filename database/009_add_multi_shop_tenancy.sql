-- Migration 009: introduce tenant isolation without deleting existing data.
-- Existing records are adopted by the legacy shop (id 1).

BEGIN;

CREATE TABLE IF NOT EXISTS shops (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  logo_url    TEXT,
  show_logo   BOOLEAN NOT NULL DEFAULT TRUE,
  show_name   BOOLEAN NOT NULL DEFAULT TRUE,
  phone       VARCHAR(50),
  address     TEXT,
  currency    VARCHAR(10) NOT NULL DEFAULT 'USD',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO shops (id, name, currency)
VALUES (1, 'Existing Store', 'USD')
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('shops', 'id'), GREATEST((SELECT MAX(id) FROM shops), 1), true);

ALTER TABLE users      ADD COLUMN IF NOT EXISTS shop_id INTEGER;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS shop_id INTEGER;
ALTER TABLE products   ADD COLUMN IF NOT EXISTS shop_id INTEGER;
ALTER TABLE sales      ADD COLUMN IF NOT EXISTS shop_id INTEGER;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS shop_id INTEGER;

UPDATE users      SET shop_id = 1 WHERE shop_id IS NULL;
UPDATE categories SET shop_id = 1 WHERE shop_id IS NULL;
UPDATE products   SET shop_id = 1 WHERE shop_id IS NULL;
UPDATE sales      SET shop_id = 1 WHERE shop_id IS NULL;
UPDATE audit_logs SET shop_id = 1 WHERE shop_id IS NULL;

ALTER TABLE users      ALTER COLUMN shop_id SET NOT NULL;
ALTER TABLE categories ALTER COLUMN shop_id SET NOT NULL;
ALTER TABLE products   ALTER COLUMN shop_id SET NOT NULL;
ALTER TABLE sales      ALTER COLUMN shop_id SET NOT NULL;
ALTER TABLE audit_logs ALTER COLUMN shop_id SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_shop_fk FOREIGN KEY (shop_id) REFERENCES shops(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE categories ADD CONSTRAINT categories_shop_fk FOREIGN KEY (shop_id) REFERENCES shops(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE products ADD CONSTRAINT products_shop_fk FOREIGN KEY (shop_id) REFERENCES shops(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE sales ADD CONSTRAINT sales_shop_fk FOREIGN KEY (shop_id) REFERENCES shops(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_shop_fk FOREIGN KEY (shop_id) REFERENCES shops(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_users_shop_id ON users (shop_id);
CREATE INDEX IF NOT EXISTS idx_categories_shop_id ON categories (shop_id);
CREATE INDEX IF NOT EXISTS idx_products_shop_id ON products (shop_id);
CREATE INDEX IF NOT EXISTS idx_sales_shop_id ON sales (shop_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_shop_id ON audit_logs (shop_id);

ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_name_key;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_barcode_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_shop_name ON categories (shop_id, LOWER(name));
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_shop_barcode ON products (shop_id, barcode) WHERE barcode IS NOT NULL;

COMMIT;
