-- Seed 001: Initial owner account
-- Password: Admin@1234
-- Hash generated with bcrypt (cost factor 12).
-- CHANGE THIS PASSWORD IMMEDIATELY after first login.
-- ON CONFLICT clauses make this safe to re-run against existing databases.

INSERT INTO users (username, email, password_hash, full_name, role_id, is_active)
VALUES (
  'owner',
  'owner@store.local',
  '$2b$12$Bv2kPEWj0.3WDrf9EZCik./UeFauDu8fVq1j/k2Lt3gaYcJr01vTC',
  'Store Owner',
  (SELECT id FROM roles WHERE name = 'owner'),
  TRUE
)
ON CONFLICT (username) DO NOTHING;

-- Seed sample categories
INSERT INTO categories (name, description) VALUES
  ('General',     'General merchandise'),
  ('Electronics', 'Electronic items'),
  ('Food',        'Food and beverages')
ON CONFLICT (name) DO NOTHING;
