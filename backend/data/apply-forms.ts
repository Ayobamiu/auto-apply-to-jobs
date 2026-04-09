/**
 * Apply form schema per job (captured when apply modal is open). CRUD-style API.
 * Migrated from filesystem to Postgres (application_forms.schema column).
 *
 * Both this module and upsertApplicationForm (application-forms.ts) write to the
 * same (user_id, job_ref) row.  ON CONFLICT merges via  schema || new  so that
 * keys written by the other path (e.g. presentSections) are preserved.
 */
import { pool, ensureDataTables } from '../api/db.js';

export async function getApplyFormSchema(
  userId: string,
  site: string,
  jobId: string,
): Promise<Record<string, unknown> | null> {
  if (!jobId) return null;
  await ensureDataTables();
  const jobRef = `${site}:${jobId}`;
  const res = await pool.query<{ schema: Record<string, unknown> }>(
    `SELECT schema FROM application_forms WHERE user_id = $1 AND job_ref = $2`,
    [userId, jobRef],
  );
  if (res.rows[0]?.schema) return res.rows[0].schema as Record<string, unknown>;
  return null;
}

export async function saveApplyFormSchema(
  userId: string,
  site: string,
  jobId: string,
  schema: Record<string, unknown>,
): Promise<void> {
  if (!jobId) return;
  await ensureDataTables();
  const jobRef = `${site}:${jobId}`;
  await pool.query(
    `INSERT INTO application_forms (user_id, job_ref, site, schema, classified_fields, answers, status)
     VALUES ($1, $2, $3, $4, '[]'::jsonb, '[]'::jsonb, 'draft')
     ON CONFLICT (user_id, job_ref) DO UPDATE SET
       schema = application_forms.schema || $4::jsonb,
       updated_at = now()`,
    [userId, jobRef, site, JSON.stringify(schema)],
  );
}
