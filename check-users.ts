import { Pool } from 'pg';
import { loadEnv } from './src/config/env';

loadEnv();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkRoles() {
  try {
    const res = await pool.query("SELECT id, name, email, role, active FROM users");
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

checkRoles();
