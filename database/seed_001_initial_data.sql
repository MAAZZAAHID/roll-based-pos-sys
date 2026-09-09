-- Seed 001: Initial owner account (DEVELOPMENT ONLY; never run in production)
-- The password hash below is a disposable local fixture. Replace it in an isolated environment.
-- Hash generated with bcrypt (cost factor 12).
-- Do not use this fixture as a production credential.
-- ON CONFLICT clauses make this safe to re-run against existing databases.

INSERT INTO users (shop_id, username, email, password_hash, full_name, role_id, is_active)
VALUES (
  1,
  'owner',
  'owner@store.local',
  '$2b$12$Bv2kPEWj0.3WDrf9EZCik./UeFauDu8fVq1j/k2Lt3gaYcJr01vTC',
  'Store Owner',
  (SELECT id FROM roles WHERE name = 'owner'),
  TRUE
)
ON CONFLICT (username) DO NOTHING;

-- Seed sample categories
INSERT INTO categories (shop_id, name, description) VALUES
  (1, 'General',     'General merchandise'),
  (1, 'Electronics', 'Electronic items'),
  (1, 'Food',        'Food and beverages')
ON CONFLICT DO NOTHING;
