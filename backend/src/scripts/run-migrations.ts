import fs from 'fs';
import path from 'path';
import { query } from '../db';

const migrationsPath = path.join(__dirname, '../../../database');

const files = [
  '001_create_roles.sql',
  '002_create_users.sql',
  '003_create_categories.sql',
  '004_create_products.sql',
  '005_create_inventory.sql',
  '006_create_sales.sql',
  '007_create_audit_logs.sql',
  'seed_001_initial_data.sql'
];

async function main() {
  console.log('Running migrations against database...');
  for (const file of files) {
    const filePath = path.join(migrationsPath, file);
    if (!fs.existsSync(filePath)) {
      console.error(`Migration file not found: ${filePath}`);
      process.exit(1);
    }
    
    const sql = fs.readFileSync(filePath, 'utf-8');
    try {
      await query(sql);
      console.log(`✅  Executed ${file}`);
    } catch (err: any) {
      console.error(`❌  Failed to execute ${file}`);
      console.error(err.message);
      process.exit(1);
    }
  }
  
  console.log('All migrations completed successfully.');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
