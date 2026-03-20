/**
 * Per-job application state keyed by job URL, then by userId. Postgres-backed.
 */
import { pool, ensureDataTables } from '../api/db.js';
import type { ApplicationState } from '../shared/types.js';

const DEFAULT_USER_ID = 'default';

export function normalizeUrl(url: string): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    u.hash = '';
    u.searchParams.sort();
    return u.toString().replace(/\/$/, '');
  } catch {
    return String(url);
  }
}

interface ApplyStateRow {
  resume_path: string | null;
  uploaded_at: Date | null;
  submitted_at: Date | null;
}

function rowToApplicationState(row: ApplyStateRow): ApplicationState {
  return {
    resumePath: row.resume_path ?? undefined,
    uploadedAt: row.uploaded_at ? row.uploaded_at.toISOString() : undefined,
    submittedAt: row.submitted_at ? row.submitted_at.toISOString() : undefined,
  };
}

export async function getApplicationState(jobUrl: string, userId?: string): Promise<ApplicationState | null> {
  const uid = userId ?? DEFAULT_USER_ID;
  const key = normalizeUrl(jobUrl);
  await ensureDataTables();
  const res = await pool.query<ApplyStateRow>(
    'SELECT resume_path, uploaded_at, submitted_at FROM apply_state WHERE user_id = $1 AND job_url_normalized = $2',
    [uid, key]
  );
  const row = res.rows[0];
  return row ? rowToApplicationState(row) : null;
}

export async function setApplicationState(
  jobUrl: string,
  data: { resumePath: string; uploadedAt?: string; submittedAt?: string },
  userId?: string
): Promise<void> {
  const uid = userId ?? DEFAULT_USER_ID;
  const key = normalizeUrl(jobUrl);
  await ensureDataTables();
  const existing = await getApplicationState(jobUrl, uid);
  const uploadedAt = data.uploadedAt ?? existing?.uploadedAt ?? new Date().toISOString();
  const submittedAt = data.submittedAt != null ? data.submittedAt : existing?.submittedAt;
  await pool.query(
    `INSERT INTO apply_state (user_id, job_url_normalized, resume_path, uploaded_at, submitted_at)
     VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz)
     ON CONFLICT (user_id, job_url_normalized) DO UPDATE SET
       resume_path = EXCLUDED.resume_path,
       uploaded_at = COALESCE(EXCLUDED.uploaded_at, apply_state.uploaded_at),
       submitted_at = COALESCE(EXCLUDED.submitted_at, apply_state.submitted_at),
       updated_at = now()`,
    [uid, key, data.resumePath, uploadedAt, submittedAt ?? null]
  );
}

export async function isJobUploaded(jobUrl: string, userId?: string): Promise<boolean> {
  const s = await getApplicationState(jobUrl, userId);
  return !!(s && s.uploadedAt);
}
