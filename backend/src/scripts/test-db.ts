/**
 * Standalone script to verify Node.js → PostgreSQL connectivity.
 *
 * Usage:
 *   npm run test:db
 *
 * Requires DATABASE_URL to be set in backend/.env
 */
import pool from '../db';

async function main() {
  console.log('Testing PostgreSQL connection...\n');

  try {
    const client = await pool.connect();

    // 1. Basic connectivity
    const timeResult = await client.query('SELECT NOW() AS server_time, current_database() AS db_name, version() AS pg_version');
    const row = timeResult.rows[0];
    console.log('✅  Connected to PostgreSQL');
    console.log(`    Database    : ${row?.db_name}`);
    console.log(`    Server time : ${row?.server_time}`);
    console.log(`    PG version  : ${String(row?.pg_version).split(' ').slice(0, 2).join(' ')}`);

    // 2. Verify schema tables exist
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    const tables: string[] = tablesResult.rows.map((r: { table_name: string }) => r.table_name);
    const required = ['shops', 'roles', 'users', 'categories', 'products', 'inventory', 'inventory_adjustments', 'sales', 'sale_items', 'payments', 'refunds', 'refund_items', 'audit_logs'];
    
    console.log('\n📋  Tables found in public schema:');
    tables.forEach(t => console.log(`    - ${t}`));

    const missing = required.filter(t => !tables.includes(t));
    if (missing.length > 0) {
      console.warn(`\n⚠️  Missing tables: ${missing.join(', ')}`);
      console.warn('    Run: psql -U <user> -d <database> -f database/migrate.sql');
    } else {
      console.log('\n✅  All required tables are present.');
    }

    // 3. Verify seed data — check roles exist
    const rolesResult = await client.query('SELECT name FROM roles ORDER BY id');
    const roles: string[] = rolesResult.rows.map((r: { name: string }) => r.name);
    console.log(`\n👥  Roles: ${roles.join(', ')}`);

    client.release();
    console.log('\n✅  Database connection test PASSED.\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌  Database connection test FAILED:');
    console.error(err);
    console.error('\nCheck your DATABASE_URL in backend/.env');
    process.exit(1);
  }
}

main();
