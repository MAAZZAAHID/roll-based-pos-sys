-- ============================================================
-- Master migration runner
-- Run this file against your PostgreSQL database to set up the
-- complete schema in the correct order.
--
-- Usage:
--   psql -U <user> -d <database> -f migrate.sql
-- ============================================================

\i 001_create_roles.sql
\i 002_create_users.sql
\i 003_create_categories.sql
\i 004_create_products.sql
\i 005_create_inventory.sql
\i 006_create_sales.sql
\i 007_create_audit_logs.sql
\i 008_create_refunds.sql
\i 009_add_multi_shop_tenancy.sql
\i seed_001_initial_data.sql
