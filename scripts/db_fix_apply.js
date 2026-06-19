const { Pool } = require('pg');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(process.cwd(), '.env.development') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('No DATABASE_URL found in .env.development');
  process.exit(1);
}

const pool = new Pool({ connectionString });

(async () => {
  try {
    const before = await pool.query("SELECT id, name FROM documents WHERE name LIKE '%Ã%' OR name LIKE '%Â%'");
    console.log('Rows to fix (before):', JSON.stringify(before.rows, null, 2));
    if (before.rows.length === 0) {
      console.log('No rows to fix. Exiting.');
      return;
    }

    const ids = before.rows.map(r => r.id);

    await pool.query('BEGIN');
    const updateSql = `UPDATE documents SET name = convert_from(convert_to(name, 'LATIN1'), 'UTF8') WHERE id = ANY($1::text[])`;
    const res = await pool.query(updateSql, [ids]);
    await pool.query('COMMIT');

    console.log('Update executed. Fetching after state...');
    const after = await pool.query('SELECT id, name FROM documents WHERE id = ANY($1::text[])', [ids]);
    console.log('Rows after:', JSON.stringify(after.rows, null, 2));
  } catch (e) {
    console.error('Apply failed:', e);
    try { await pool.query('ROLLBACK'); } catch (er) {}
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
