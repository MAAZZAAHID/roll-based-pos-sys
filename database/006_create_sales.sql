-- Migration 006: Create sales, sale_items, and payments tables
CREATE TABLE IF NOT EXISTS sales (
  id             SERIAL PRIMARY KEY,
  invoice_number VARCHAR(50)    NOT NULL UNIQUE,
  cashier_id     INTEGER        NOT NULL REFERENCES users(id),
  subtotal       NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
  tax_amount     NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount   NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
  status         VARCHAR(20)    NOT NULL DEFAULT 'completed'
                   CHECK (status IN ('completed', 'voided', 'refunded')),
  notes          TEXT,
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_items (
  id           SERIAL PRIMARY KEY,
  sale_id      INTEGER        NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id   INTEGER        NOT NULL REFERENCES products(id),
  product_name VARCHAR(255)   NOT NULL,              -- snapshot at time of sale
  quantity     INTEGER        NOT NULL CHECK (quantity > 0),
  unit_price   NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0), -- authoritative price from DB at time of sale
  line_total   NUMERIC(12, 2) NOT NULL CHECK (line_total >= 0)
);

CREATE TABLE IF NOT EXISTS payments (
  id             SERIAL PRIMARY KEY,
  sale_id        INTEGER        NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method         VARCHAR(30)    NOT NULL CHECK (method IN ('cash', 'card', 'other')),
  amount_tendered NUMERIC(12, 2) NOT NULL CHECK (amount_tendered >= 0),
  change_given   NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (change_given >= 0),
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_invoice_number  ON sales (invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_cashier_id      ON sales (cashier_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at      ON sales (created_at);
CREATE INDEX IF NOT EXISTS idx_sales_status          ON sales (status);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id    ON sale_items (sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items (product_id);
CREATE INDEX IF NOT EXISTS idx_payments_sale_id      ON payments (sale_id);
