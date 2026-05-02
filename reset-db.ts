import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('Dropping tables...');
  try {
    await db.run(sql`DROP TABLE IF EXISTS companies;`);
    await db.run(sql`DROP TABLE IF EXISTS employees;`);
    await db.run(sql`DROP TABLE IF EXISTS productionReports;`);
    await db.run(sql`DROP TABLE IF EXISTS importBatches;`);
    await db.run(sql`DROP TABLE IF EXISTS batches;`);
    await db.run(sql`DROP TABLE IF EXISTS devices;`);
    await db.run(sql`DROP TABLE IF EXISTS productionLines;`);
    console.log('Dropped all tables successfully.');
  } catch (e) {
    console.error('Error dropping tables:', e);
  }
}

main();
