/**
 * Base resume JSON per user (one row per user). Used for upload/edit and as source for job-tailoring.
 */
import { pool, ensureDataTables } from '../api/db.js';

const USER_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

function validateUserId(userId: string): string {
  if (!userId || typeof userId !== 'string') return 'default';
  const t = userId.trim();
  if (!t || t === '..' || !USER_ID_REGEX.test(t)) return 'default';
  return t;
}

function validateBaseResumeContent(json: unknown): Record<string, unknown> {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error('Base resume content must be a valid JSON object.');
  }
  const obj = json as Record<string, unknown>;
  if (Object.keys(obj).length === 0) {
    throw new Error('Base resume content cannot be empty.');
  }
  const hasBasics = obj.basics && typeof obj.basics === 'object';
  const hasSchema = typeof obj.$schema === 'string';
  if (!hasBasics && !hasSchema) {
    throw new Error('Base resume must have basics or $schema (JSON Resume format).');
  }
  return obj;
}

export async function getBaseResume(userId: string): Promise<Record<string, unknown> | null> {
  const uid = validateUserId(userId);
  await ensureDataTables();
  const res = await pool.query<{ content: unknown }>(
    'SELECT content FROM user_resumes WHERE user_id = $1',
    [uid]
  );
  const row = res.rows[0];
  if (!row?.content || typeof row.content !== 'object' || Array.isArray(row.content)) {
    return null;
  }
  return row.content as Record<string, unknown>;
}

export async function saveBaseResume(
  userId: string,
  content: Record<string, unknown>
): Promise<void> {
  const uid = validateUserId(userId);
  const validated = validateBaseResumeContent(content);
  await ensureDataTables();
  await pool.query(
    `INSERT INTO user_resumes (user_id, content, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (user_id) DO UPDATE SET content = $2::jsonb, updated_at = now()`,
    [uid, JSON.stringify(validated)]
  );
}

export async function hasBaseResume(userId: string): Promise<boolean> {
  const resume = await getBaseResume(userId);
  return !!resume && Object.keys(resume).length > 0;
}
