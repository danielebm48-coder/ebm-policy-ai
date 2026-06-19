import { Pool } from 'pg';
import { loadEnv } from './src/config/env';

loadEnv();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkRateLimits() {
  try {
    const res = await pool.query("SELECT * FROM role_permissions");
    console.log('Role Permissions (Rate Limits):', JSON.stringify(res.rows, null, 2));
  } catch (e: any) {
    console.error('Table role_permissions might not exist yet:', e.message);
  } finally {
    await pool.end();
  }
}

checkRateLimits();
