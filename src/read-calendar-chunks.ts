import { Pool } from 'pg';
import { loadEnv } from './config/env';

loadEnv();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function readChunks() {
  const res = await pool.query("SELECT text, document_id FROM document_chunks WHERE text ILIKE '%PEP%' LIMIT 5");
  console.log(JSON.stringify(res.rows, null, 2));
  await pool.end();
}

readChunks();
