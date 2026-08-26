-- Migration 005: Create inventory table
-- One row per product. Inventory is managed with SELECT ... FOR UPDATE
-- to safely handle concurrent sales without going negative.
CREATE TABLE IF NOT EXISTS inventory (
  id             SERIAL PRIMARY KEY,
  product_id     INTEGER     NOT NULL UNIQUE REFERENCES products(id),
  quantity        INTEGER     NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- History of every stock change
CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id              SERIAL PRIMARY KEY,
  product_id      INTEGER      NOT NULL REFERENCES products(id),
  adjusted_by     INTEGER      NOT NULL REFERENCES users(id),
  quantity_change INTEGER      NOT NULL,                   -- positive = add, negative = remove
  quantity_before INTEGER      NOT NULL,
  quantity_after  INTEGER      NOT NULL CHECK (quantity_after >= 0),
  reason          VARCHAR(255) NOT NULL,
  reference_type  VARCHAR(50),                             -- e.g. 'sale', 'manual', 'return'
  reference_id    INTEGER,                                 -- e.g. sale_id
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_product_id             ON inventory (product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_product_id ON inventory_adjustments (product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_adjusted_by ON inventory_adjustments (adjusted_by);
CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_created_at  ON inventory_adjustments (created_at);
