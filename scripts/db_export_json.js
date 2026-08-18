const { Pool } = require('pg');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config({ path: path.join(process.cwd(), '.env.development') });
const conn = process.env.DATABASE_URL;
if (!conn) {
  console.error('DATABASE_URL not found in .env.development');
  process.exit(1);
}

const pool = new Pool({ connectionString: conn });

(async () => {
  try {
    const backupsDir = path.join(process.cwd(), 'backups', 'json');
    fs.mkdirSync(backupsDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // List user tables in public schema
    const tablesRes = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    for (const row of tablesRes.rows) {
      const table = row.table_name;
      console.log('Exporting table', table);
      const dataRes = await pool.query(`SELECT * FROM public."${table}"`);
      const outFile = path.join(backupsDir, `${table}-${timestamp}.json`);
      fs.writeFileSync(outFile, JSON.stringify(dataRes.rows, null, 2), 'utf8');
      console.log('Wrote', outFile);
    }

    console.log('Export complete. Files are in', path.join('backups', 'json'));
  } catch (e) {
    console.error('Export failed:', e);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
