-- Migration 008: Track partial and full sale refunds without deleting sales

BEGIN;

CREATE TABLE IF NOT EXISTS refunds (
  id              SERIAL PRIMARY KEY,
  sale_id         INTEGER NOT NULL REFERENCES sales(id),
  refunded_by     INTEGER NOT NULL REFERENCES users(id),
  amount          NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  method          VARCHAR(30) NOT NULL CHECK (method IN ('cash', 'card', 'other')),
  reason          VARCHAR(255) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refund_items (
  id              SERIAL PRIMARY KEY,
  refund_id       INTEGER NOT NULL REFERENCES refunds(id) ON DELETE CASCADE,
  sale_item_id    INTEGER NOT NULL REFERENCES sale_items(id),
  product_id      INTEGER NOT NULL REFERENCES products(id),
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  unit_price      NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  line_total      NUMERIC(12, 2) NOT NULL CHECK (line_total > 0)
);

CREATE INDEX IF NOT EXISTS idx_refunds_sale_id ON refunds (sale_id);
CREATE INDEX IF NOT EXISTS idx_refund_items_refund_id ON refund_items (refund_id);
CREATE INDEX IF NOT EXISTS idx_refund_items_sale_item_id ON refund_items (sale_item_id);

COMMIT;
