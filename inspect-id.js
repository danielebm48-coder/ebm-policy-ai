const { Pool } = require('pg');
require('dotenv').config({ path: '.env.development' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
  try {
    const res = await pool.query("SELECT column_name, column_default FROM information_schema.columns WHERE table_name = 'document_chunks' AND column_name = 'id'");
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
run();
