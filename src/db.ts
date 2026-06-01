import { Pool } from 'pg';
import { loadEnv } from './config/env';

loadEnv();

const connectionString = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/school_policy_ai';
export const pool = new Pool({ connectionString });

export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      active BOOLEAN NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS policies (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL,
      effective_date TIMESTAMPTZ NOT NULL,
      version INTEGER NOT NULL,
      tags JSONB NOT NULL,
      content TEXT NOT NULL,
      created_by TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      FOREIGN KEY(created_by) REFERENCES users(id),
      FOREIGN KEY(updated_by) REFERENCES users(id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS policy_versions (
      version_id TEXT PRIMARY KEY,
      policy_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      status TEXT NOT NULL,
      effective_date TIMESTAMPTZ NOT NULL,
      version INTEGER NOT NULL,
      tags JSONB NOT NULL,
      content TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      FOREIGN KEY(policy_id) REFERENCES policies(id),
      FOREIGN KEY(created_by) REFERENCES users(id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS queries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      question TEXT NOT NULL,
      requested_at TIMESTAMPTZ NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      FOREIGN KEY(actor_id) REFERENCES users(id)
    );
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_policies_status ON policies(status);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_policies_category ON policies(category);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_queries_user ON queries(user_id);');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS authorized_student_codes (
      code TEXT PRIMARY KEY,
      student_name TEXT,
      used BOOLEAN NOT NULL DEFAULT FALSE,
      used_by_email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      used_at TIMESTAMPTZ
    );
  `);
}
