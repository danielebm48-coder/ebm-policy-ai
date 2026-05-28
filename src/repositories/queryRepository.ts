import { pool } from '../db';
import { PolicyQuery } from '../models';

export async function createQuery(query: PolicyQuery): Promise<void> {
  await pool.query(
    `INSERT INTO queries (id, user_id, role, question, requested_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [query.id, query.userId, query.role, query.question, query.requestedAt],
  );
}
