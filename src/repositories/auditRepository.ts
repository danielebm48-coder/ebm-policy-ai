import { pool } from '../db';
import { AuditEntry } from '../models';

export async function addAuditEntry(entry: Omit<AuditEntry, 'createdAt'>): Promise<AuditEntry> {
  const createdAt = new Date().toISOString();
  const id = `audit_${Math.random().toString(36).substring(2, 10)}`;
  await pool.query(
    `INSERT INTO audit_logs (id, action, actor_id, details, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, entry.action, entry.actorId, entry.details, createdAt],
  );

  return {
    ...entry,
    id,
    createdAt,
  };
}
