/**
 * Apply form schema per job (captured when apply modal is open). CRUD-style API.
 * Migrated from filesystem to Postgres (application_forms.schema column).
 */
import { pool, ensureDataTables } from '../api/db.js';

export async function getApplyFormSchema(jobId: string): Promise<Record<string, unknown> | null> {
  if (!jobId) return null;
  await ensureDataTables();
  const res = await pool.query<{ schema: Record<string, unknown> }>(
    `SELECT schema FROM application_forms WHERE job_ref LIKE $1 ORDER BY updated_at DESC LIMIT 1`,
    [`%:${jobId}`],
  );
  if (res.rows[0]?.schema) return res.rows[0].schema as Record<string, unknown>;
  return null;
}

export async function saveApplyFormSchema(jobId: string, schema: Record<string, unknown>): Promise<void> {
  if (!jobId) return;
  await ensureDataTables();
  const jobRef = `unknown:${jobId}`;
  await pool.query(
    `INSERT INTO application_forms (user_id, job_ref, site, schema, classified_fields, answers, status)
     VALUES ('system', $1, 'unknown', $2, '[]'::jsonb, '[]'::jsonb, 'draft')
     ON CONFLICT (user_id, job_ref) DO UPDATE SET
       schema = $2,
       updated_at = now()`,
    [jobRef, JSON.stringify(schema)],
  );
}
