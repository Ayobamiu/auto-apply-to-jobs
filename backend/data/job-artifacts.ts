/**
 * Job artifacts: resume JSON and cover letter text stored in Postgres.
 * Scalable for future artifact types (portfolio, etc.).
 */
import { pool, ensureDataTables } from '../api/db.js';
import { toJobRef } from './user-job-state.js';
import { AppError, CODES } from '../shared/errors.js';
import type { Resume } from '../types/resume.js';
import { formatResume } from '../utils/format-resume.js';

export const ARTIFACT_TYPES = ['resume', 'cover_letter', 'written_document'] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

const USER_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const COVER_LETTER_MAX_BYTES = 50 * 1024; // 50KB

function validateUserId(userId: string): string {
  if (!userId || typeof userId !== 'string') return 'default';
  const t = userId.trim();
  if (!t || t === '..' || !USER_ID_REGEX.test(t)) return 'default';
  return t;
}

function validateJobRef(ref: string): boolean {
  return !!ref && typeof ref === 'string' && ref.includes(':');
}

function validateResumeContent(json: unknown): Record<string, unknown> {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new AppError(CODES.NO_RESUME, 'Resume content must be a valid JSON object.');
  }
  const obj = json as Record<string, unknown>;
  if (Object.keys(obj).length === 0) {
    throw new AppError(CODES.NO_RESUME, 'Resume content cannot be empty.');
  }
  if (!obj.basics && !obj.$schema) {
    throw new AppError(CODES.NO_RESUME, 'Resume must have basics or $schema (JSON Resume format).');
  }
  return obj;
}

function validateCoverLetterContent(json: unknown): { text: string } {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new AppError(CODES.PREFLIGHT_FAILED, 'Cover letter content must be { text: string }.');
  }
  const obj = json as Record<string, unknown>;
  const text = obj.text;
  if (typeof text !== 'string' || !text.trim()) {
    throw new AppError(CODES.PREFLIGHT_FAILED, 'Cover letter text is required and must be non-empty.');
  }
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > COVER_LETTER_MAX_BYTES) {
    throw new AppError(CODES.PREFLIGHT_FAILED, `Cover letter text exceeds ${COVER_LETTER_MAX_BYTES / 1024}KB limit.`);
  }
  return { text: text.trim() };
}

const WRITTEN_DOC_MAX_BYTES = 100 * 1024; // 100KB

export interface WrittenDocumentContent {
  text: string;
  instructions?: string;
}

function validateWrittenDocumentContent(json: unknown): WrittenDocumentContent {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new AppError(CODES.PREFLIGHT_FAILED, 'Written document content must be { text: string }.');
  }
  const obj = json as Record<string, unknown>;
  const text = obj.text;
  if (typeof text !== 'string' || !text.trim()) {
    throw new AppError(CODES.PREFLIGHT_FAILED, 'Written document text is required and must be non-empty.');
  }
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > WRITTEN_DOC_MAX_BYTES) {
    throw new AppError(CODES.PREFLIGHT_FAILED, `Written document text exceeds ${WRITTEN_DOC_MAX_BYTES / 1024}KB limit.`);
  }
  return {
    text: text.trim(),
    instructions: typeof obj.instructions === 'string' ? obj.instructions : undefined,
  };
}

export async function getJobArtifact(
  userId: string,
  jobRef: string,
  artifactType: ArtifactType
): Promise<unknown | null> {
  const uid = validateUserId(userId);
  if (!validateJobRef(jobRef)) return null;
  await ensureDataTables();
  const res = await pool.query<{ content: unknown }>(
    'SELECT content FROM job_artifacts WHERE user_id = $1 AND job_ref = $2 AND artifact_type = $3',
    [uid, jobRef, artifactType]
  );
  const row = res.rows[0];
  return row ? row.content : null;
}

export async function saveJobArtifact(
  userId: string,
  jobRef: string,
  artifactType: ArtifactType,
  content: unknown
): Promise<void> {
  const uid = validateUserId(userId);
  if (!validateJobRef(jobRef)) {
    throw new AppError(CODES.JOB_NOT_FOUND, 'Invalid job_ref.');
  }
  if (!ARTIFACT_TYPES.includes(artifactType)) {
    throw new AppError(CODES.PREFLIGHT_FAILED, `Invalid artifact_type: ${artifactType}`);
  }
  let validated: unknown;
  if (artifactType === 'resume') {
    validated = formatResume(validateResumeContent(content) as Partial<Resume>);
  } else if (artifactType === 'cover_letter') {
    validated = validateCoverLetterContent(content);
  } else if (artifactType === 'written_document') {
    validated = validateWrittenDocumentContent(content);
  } else {
    validated = content;
  }
  await ensureDataTables();
  await pool.query(
    `INSERT INTO job_artifacts (user_id, job_ref, artifact_type, content, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, now())
     ON CONFLICT (user_id, job_ref, artifact_type) DO UPDATE SET content = EXCLUDED.content, updated_at = now()`,
    [uid, jobRef, artifactType, JSON.stringify(validated)]
  );
}

export async function getResumeForJob(
  userId: string,
  site: string,
  jobId: string
): Promise<Record<string, unknown> | null> {
  const jobRef = toJobRef(site, jobId);
  if (!jobRef) return null;
  const raw = await getJobArtifact(userId, jobRef, 'resume');
  if (!raw) return null;
  return validateResumeContent(raw) as Record<string, unknown>;
}

export async function saveResumeForJob(
  userId: string,
  site: string,
  jobId: string,
  resumeJson: Record<string, unknown>
): Promise<void> {
  const jobRef = toJobRef(site, jobId);
  if (!jobRef) throw new AppError(CODES.JOB_NOT_FOUND, 'Invalid site or jobId.');
  await saveJobArtifact(userId, jobRef, 'resume', resumeJson);
}

export async function getCoverLetterForJob(
  userId: string,
  site: string,
  jobId: string
): Promise<{ text: string } | null> {
  const jobRef = toJobRef(site, jobId);
  if (!jobRef) return null;
  const raw = await getJobArtifact(userId, jobRef, 'cover_letter');
  if (!raw) return null;
  try {
    return validateCoverLetterContent(raw);
  } catch {
    return null;
  }
}

export async function saveCoverLetterForJob(
  userId: string,
  site: string,
  jobId: string,
  content: { text: string }
): Promise<void> {
  const jobRef = toJobRef(site, jobId);
  if (!jobRef) throw new AppError(CODES.JOB_NOT_FOUND, 'Invalid site or jobId.');
  await saveJobArtifact(userId, jobRef, 'cover_letter', content);
}

export async function getEditHistory(
  userId: string,
  jobRef: string,
  artifactType: ArtifactType
): Promise<string[]> {
  const uid = validateUserId(userId);
  if (!validateJobRef(jobRef)) return [];
  await ensureDataTables();
  const res = await pool.query<{ edit_history: string[] }>(
    'SELECT edit_history FROM job_artifacts WHERE user_id = $1 AND job_ref = $2 AND artifact_type = $3',
    [uid, jobRef, artifactType]
  );
  return res.rows[0]?.edit_history ?? [];
}

export async function getWrittenDocumentForJob(
  userId: string,
  site: string,
  jobId: string
): Promise<WrittenDocumentContent | null> {
  const jobRef = toJobRef(site, jobId);
  if (!jobRef) return null;
  const docs = await getWrittenDocumentsForJob(userId, site, jobId);
  return docs[0] ?? null;
}

export async function getWrittenDocumentsForJob(
  userId: string,
  site: string,
  jobId: string,
): Promise<(WrittenDocumentContent & { artifactId: string | null })[]> {
  const jobRef = toJobRef(site, jobId);
  if (!jobRef) return [];
  const uid = validateUserId(userId);
  await ensureDataTables();
  const res = await pool.query<{ artifact_id: string | null; content: unknown }>(
    'SELECT artifact_id, content FROM job_artifacts WHERE user_id = $1 AND job_ref = $2 AND artifact_type = $3 ORDER BY artifact_id NULLS LAST',
    [uid, jobRef, 'written_document'],
  );
  const out: (WrittenDocumentContent & { artifactId: string | null })[] = [];
  for (const row of res.rows) {
    try {
      const parsed = validateWrittenDocumentContent(row.content);
      out.push({ ...parsed, artifactId: row.artifact_id });
    } catch {
      // ignore invalid rows
      // eslint-disable-next-line no-continue
      continue;
    }
  }
  return out;
}

export async function getWrittenDocumentForJobArtifact(
  userId: string,
  site: string,
  jobId: string,
  artifactId: string,
): Promise<WrittenDocumentContent | null> {
  const jobRef = toJobRef(site, jobId);
  if (!jobRef) return null;
  const uid = validateUserId(userId);
  await ensureDataTables();
  const res = await pool.query<{ content: unknown }>(
    'SELECT content FROM job_artifacts WHERE user_id = $1 AND job_ref = $2 AND artifact_type = $3 AND artifact_id = $4',
    [uid, jobRef, 'written_document', artifactId],
  );
  const row = res.rows[0];
  if (!row) return null;
  try {
    return validateWrittenDocumentContent(row.content);
  } catch {
    return null;
  }
}

export async function saveWrittenDocumentForJob(
  userId: string,
  site: string,
  jobId: string,
  artifactId: string,
  content: WrittenDocumentContent,
): Promise<void> {
  if (!artifactId) throw new AppError(CODES.PREFLIGHT_FAILED, 'Artifact ID is required.');
  console.log('Saving written document to database', { userId, site, jobId, artifactId, content });
  const jobRef = toJobRef(site, jobId);
  if (!jobRef) throw new AppError(CODES.JOB_NOT_FOUND, 'Invalid site or jobId.');
  const uid = validateUserId(userId);
  const validated = validateWrittenDocumentContent(content);
  console.log('Validated written document', { validated });
  await ensureDataTables();
  // Evict stale artifact_id from a different job (same label hash → same id across jobs)
  await pool.query(
    `DELETE FROM job_artifacts WHERE artifact_id = $1 AND NOT (user_id = $2 AND job_ref = $3 AND artifact_type = $4)`,
    [artifactId, uid, jobRef, 'written_document'],
  );
  await pool.query(
    `INSERT INTO job_artifacts (user_id, job_ref, artifact_type, artifact_id, content, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, now())
     ON CONFLICT (user_id, job_ref, artifact_type)
     DO UPDATE SET 
     artifact_id = EXCLUDED.artifact_id,
     content = EXCLUDED.content, 
     updated_at = now()`,
    [uid, jobRef, 'written_document', artifactId, JSON.stringify(validated)],
  );
}

export async function appendEditHistory(
  userId: string,
  jobRef: string,
  artifactType: ArtifactType,
  entry: string,
  maxEntries = 20
): Promise<void> {
  const uid = validateUserId(userId);
  if (!validateJobRef(jobRef)) return;
  await ensureDataTables();
  await pool.query(
    `UPDATE job_artifacts
     SET edit_history = (
       SELECT jsonb_agg(e)
       FROM (SELECT e FROM jsonb_array_elements(COALESCE(edit_history, '[]'::jsonb) || to_jsonb($4::text)) AS e OFFSET GREATEST(0, jsonb_array_length(COALESCE(edit_history, '[]'::jsonb)) + 1 - $5)) sub
     ), updated_at = now()
     WHERE user_id = $1 AND job_ref = $2 AND artifact_type = $3`,
    [uid, jobRef, artifactType, entry, maxEntries]
  );
}
