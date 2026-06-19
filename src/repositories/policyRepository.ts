import { pool } from '../db';
import { PolicyDocument, PolicyVersion, PolicyCategory, PolicyStatus } from '../models';
import { normalizeText } from '../utils/encoding';

function mapPolicyRow(row: any): PolicyDocument {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    category: row.category as PolicyCategory,
    status: row.status as PolicyStatus,
    effectiveDate: row.effective_date,
    version: row.version,
    tags: row.tags,
    content: row.content,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapVersionRow(row: any): PolicyVersion {
  return {
    versionId: row.version_id,
    policyId: row.policy_id,
    title: row.title,
    summary: row.summary,
    status: row.status as PolicyStatus,
    effectiveDate: row.effective_date,
    tags: row.tags,
    content: row.content,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function createPolicy(policy: Omit<PolicyDocument, 'id' | 'createdAt' | 'updatedAt'>): Promise<PolicyDocument> {
  const now = new Date().toISOString();
  const id = `policy_${Math.random().toString(36).substring(2, 10)}`;
  const version = 1;

  const title = normalizeText(policy.title);
  const summary = normalizeText(policy.summary || '');
  const content = normalizeText(policy.content || '');

  await pool.query(
    `INSERT INTO policies (id, title, summary, category, status, effective_date, version, tags, content, created_by, updated_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [id, title, summary, policy.category, policy.status, policy.effectiveDate, version, JSON.stringify(policy.tags), content, policy.createdBy, policy.updatedBy, now, now],
  );

  const versionTitle = normalizeText(policy.title);
  const versionSummary = normalizeText(policy.summary || '');
  const versionContent = normalizeText(policy.content || '');

  await pool.query(
    `INSERT INTO policy_versions (version_id, policy_id, title, summary, status, effective_date, version, tags, content, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [`version_${Math.random().toString(36).substring(2, 10)}`, id, versionTitle, versionSummary, policy.status, policy.effectiveDate, version, JSON.stringify(policy.tags), versionContent, policy.createdBy, now],
  );

  const created = await getPolicyById(id);
  if (!created) throw new Error('Failed to create policy');
  return created;
}

export async function updatePolicy(policyId: string, updates: Partial<Omit<PolicyDocument, 'id' | 'createdAt'>>): Promise<PolicyDocument | null> {
  const existing = await getPolicyById(policyId);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated = {
    ...existing,
    ...updates,
    tags: updates.tags ?? existing.tags,
    updatedAt: now,
    version: existing.version + 1,
  };

  await pool.query(
    `UPDATE policies SET title = $1, summary = $2, category = $3, status = $4, effective_date = $5, version = $6, tags = $7, content = $8, updated_by = $9, updated_at = $10 WHERE id = $11`,
    [
      normalizeText(updated.title),
      normalizeText(updated.summary || ''),
      updated.category,
      updated.status,
      updated.effectiveDate,
      updated.version,
      JSON.stringify(updated.tags),
      normalizeText(updated.content || ''),
      updated.updatedBy,
      updated.updatedAt,
      policyId,
    ],
  );

  const verTitle = normalizeText(updated.title);
  const verSummary = normalizeText(updated.summary || '');
  const verContent = normalizeText(updated.content || '');

  await pool.query(
    `INSERT INTO policy_versions (version_id, policy_id, title, summary, status, effective_date, version, tags, content, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [`version_${Math.random().toString(36).substring(2, 10)}`, policyId, verTitle, verSummary, updated.status, updated.effectiveDate, updated.version, JSON.stringify(updated.tags), verContent, updated.updatedBy, updated.updatedAt],
  );

  return getPolicyById(policyId);
}

export async function getPolicyById(policyId: string): Promise<PolicyDocument | null> {
  const result = await pool.query('SELECT * FROM policies WHERE id = $1', [policyId]);
  const row = result.rows[0];
  if (!row) return null;
  return mapPolicyRow(row);
}

export async function listPolicies(role?: string): Promise<PolicyDocument[]> {
  const result = role && role !== 'admin' && role !== 'directivo'
    ? await pool.query('SELECT * FROM policies WHERE status = $1 ORDER BY effective_date DESC', ['published'])
    : await pool.query('SELECT * FROM policies ORDER BY effective_date DESC');
  return result.rows.map(mapPolicyRow);
}

export async function searchPolicies(query: string): Promise<PolicyDocument[]> {
  const normalized = `%${query.trim().toLowerCase()}%`;
  const result = await pool.query(
    `SELECT * FROM policies WHERE
       LOWER(title) LIKE $1 OR LOWER(summary) LIKE $1 OR LOWER(content) LIKE $1 OR LOWER(tags::text) LIKE $1
       ORDER BY effective_date DESC`,
    [normalized],
  );
  return result.rows.map(mapPolicyRow);
}

export async function listPolicyVersions(policyId: string): Promise<PolicyVersion[]> {
  const result = await pool.query('SELECT * FROM policy_versions WHERE policy_id = $1 ORDER BY version DESC', [policyId]);
  return result.rows.map(mapVersionRow);
}
