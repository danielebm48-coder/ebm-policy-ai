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
    const sql = `SELECT id, name, convert_from(convert_to(name, 'LATIN1'), 'UTF8') AS fixed_name
                 FROM documents
                 WHERE name LIKE '%Ã%' OR name LIKE '%Â%'`;
    const res = await pool.query(sql);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (e) {
    console.error('Preview query failed:', e);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
