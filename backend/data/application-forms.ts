/**
 * Data access for application_forms and saved_answers tables.
 */
import { pool, ensureDataTables } from '../api/db.js';
import type {
  ApplicationFormRecord,
  NormalizedFormSchema,
  ClassifiedField,
  GeneratedAnswer,
  SavedAnswer,
  FieldIntent,
  ExtendedProfileFields,
} from '../shared/types.js';

// ── Application Forms ────────────────────────────────────────────────────

export async function getApplicationForm(
  userId: string,
  jobRef: string,
): Promise<ApplicationFormRecord | null> {
  await ensureDataTables();
  const res = await pool.query(
    `SELECT id, user_id, job_ref, site, schema, classified_fields, answers, status, created_at, updated_at
     FROM application_forms WHERE user_id = $1 AND job_ref = $2`,
    [userId, jobRef],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    jobRef: row.job_ref,
    site: row.site,
    schema: row.schema as NormalizedFormSchema,
    classifiedFields: row.classified_fields as ClassifiedField[],
    answers: row.answers as GeneratedAnswer[],
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function upsertApplicationForm(record: ApplicationFormRecord): Promise<string> {
  await ensureDataTables();
  const res = await pool.query(
    `INSERT INTO application_forms (user_id, job_ref, site, schema, classified_fields, answers, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, job_ref) DO UPDATE SET
       schema = application_forms.schema || (EXCLUDED.schema - 'presentSections'),
       classified_fields = EXCLUDED.classified_fields,
       answers = EXCLUDED.answers,
       status = EXCLUDED.status,
       updated_at = now()
     RETURNING id`,
    [
      record.userId,
      record.jobRef,
      record.site,
      JSON.stringify(record.schema),
      JSON.stringify(record.classifiedFields),
      JSON.stringify(record.answers),
      record.status,
    ],
  );
  return res.rows[0].id;
}

export async function updateApplicationFormAnswers(
  userId: string,
  jobRef: string,
  answers: GeneratedAnswer[],
  status?: 'draft' | 'reviewed' | 'submitted',
): Promise<void> {
  await ensureDataTables();
  const setClauses = ['answers = $3', 'updated_at = now()'];
  const params: unknown[] = [userId, jobRef, JSON.stringify(answers)];
  if (status) {
    setClauses.push(`status = $${params.length + 1}`);
    params.push(status);
  }
  await pool.query(
    `UPDATE application_forms SET ${setClauses.join(', ')} WHERE user_id = $1 AND job_ref = $2`,
    params,
  );
}

export async function updateApplicationFormStatus(
  userId: string,
  jobRef: string,
  status: 'draft' | 'reviewed' | 'submitted',
): Promise<void> {
  await ensureDataTables();
  await pool.query(
    `UPDATE application_forms SET status = $3, updated_at = now() WHERE user_id = $1 AND job_ref = $2`,
    [userId, jobRef, status],
  );
}

// ── Saved Answers ────────────────────────────────────────────────────────

export async function getSavedAnswer(
  userId: string,
  intent: FieldIntent,
  questionHash?: string,
): Promise<SavedAnswer | null> {
  await ensureDataTables();
  let res;
  if (questionHash) {
    res = await pool.query(
      `SELECT * FROM saved_answers WHERE user_id = $1 AND intent = $2 AND question_hash = $3`,
      [userId, intent, questionHash],
    );
  }
  if (!res?.rows[0]) {
    res = await pool.query(
      `SELECT * FROM saved_answers WHERE user_id = $1 AND intent = $2 AND question_hash IS NULL
       ORDER BY used_count DESC LIMIT 1`,
      [userId, intent],
    );
  }
  const row = res.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    intent: row.intent,
    questionHash: row.question_hash,
    answerValue: row.answer_value,
    usedCount: row.used_count,
  };
}

export async function upsertSavedAnswer(
  userId: string,
  intent: FieldIntent,
  answerValue: string,
  questionHash?: string,
): Promise<void> {
  await ensureDataTables();
  await pool.query(
    `INSERT INTO saved_answers (user_id, intent, question_hash, answer_value)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, intent, question_hash) DO UPDATE SET
       answer_value = EXCLUDED.answer_value,
       used_count = saved_answers.used_count + 1,
       updated_at = now()`,
    [userId, intent, questionHash || null, answerValue],
  );
}

export async function getAllSavedAnswers(userId: string): Promise<SavedAnswer[]> {
  await ensureDataTables();
  const res = await pool.query(
    `SELECT * FROM saved_answers WHERE user_id = $1 ORDER BY updated_at DESC`,
    [userId],
  );
  return res.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    intent: row.intent,
    questionHash: row.question_hash,
    answerValue: row.answer_value,
    usedCount: row.used_count,
  }));
}

// ── Extended Profile ─────────────────────────────────────────────────────

export async function getExtendedProfile(userId: string): Promise<ExtendedProfileFields> {
  await ensureDataTables();
  const res = await pool.query(
    `SELECT extended FROM profiles WHERE user_id = $1`,
    [userId],
  );
  return (res.rows[0]?.extended as ExtendedProfileFields) || {};
}

export async function updateExtendedProfile(
  userId: string,
  fields: Partial<ExtendedProfileFields>,
): Promise<void> {
  await ensureDataTables();
  // Merge with existing extended fields
  await pool.query(
    `UPDATE profiles SET extended = COALESCE(extended, '{}'::jsonb) || $2::jsonb, updated_at = now()
     WHERE user_id = $1`,
    [userId, JSON.stringify(fields)],
  );
}
