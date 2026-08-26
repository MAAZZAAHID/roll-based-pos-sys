-- Migration 007: Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER      REFERENCES users(id),       -- nullable if system action
  action      VARCHAR(100) NOT NULL,                   -- e.g. 'user.created', 'sale.completed'
  entity_type VARCHAR(50)  NOT NULL,                   -- e.g. 'user', 'product', 'sale'
  entity_id   INTEGER,
  old_values  JSONB,
  new_values  JSONB,
  ip_address  INET,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id     ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action      ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs (entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id   ON audit_logs (entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at  ON audit_logs (created_at);
