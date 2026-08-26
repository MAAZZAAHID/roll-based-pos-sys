-- Migration 004: Create products table
CREATE TABLE IF NOT EXISTS products (
  id                  SERIAL PRIMARY KEY,
  name                VARCHAR(255) NOT NULL,
  barcode             VARCHAR(100) UNIQUE,           -- nullable; unique when set
  category_id         INTEGER      REFERENCES categories(id),
  selling_price       NUMERIC(12, 2) NOT NULL CHECK (selling_price >= 0),
  cost_price          NUMERIC(12, 2) NOT NULL CHECK (cost_price >= 0),
  low_stock_threshold INTEGER      NOT NULL DEFAULT 10 CHECK (low_stock_threshold >= 0),
  is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_barcode     ON products (barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_is_active   ON products (is_active);
CREATE INDEX IF NOT EXISTS idx_products_name        ON products (name);
