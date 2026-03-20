/**
 * Pipeline job storage: create, read, update status for async pipeline runs.
 */
import { pool, ensureDataTables } from '../api/db.js';
import { toHandshakeJobDetailsUrl } from '../shared/job-from-url.js';

export type PipelineJobStatus = 'pending' | 'running' | 'done' | 'failed' | 'awaiting_approval' | 'cancelled';

export interface PipelineJob {
  id: string;
  user_id: string;
  job_url: string;
  status: PipelineJobStatus;
  submit: boolean;
  force_scrape: boolean;
  automation_level: string | null;
  result: unknown | null;
  error: string | null;
  error_code: string | null;
  phase: string | null;
  artifacts: unknown | null;
  created_at: Date;
  updated_at: Date;
}

export async function createPipelineJob(
  userId: string,
  jobUrl: string,
  options: { submit?: boolean; forceScrape?: boolean; automationLevel?: string } = {}
): Promise<{ id: string }> {
  await ensureDataTables();
  const automationLevel = options.automationLevel === 'full' ? 'full' : 'review';
  const res = await pool.query<{ id: string }>(
    `INSERT INTO pipeline_jobs (user_id, job_url, submit, force_scrape, automation_level)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [userId, jobUrl, options.submit ?? false, options.forceScrape ?? false, automationLevel]
  );
  return { id: res.rows[0].id };
}

/** Load by id only (no user check). For the background runner only. */
export async function getPipelineJobById(jobId: string): Promise<PipelineJob | null> {
  await ensureDataTables();
  const res = await pool.query<PipelineJob>(
    'SELECT * FROM pipeline_jobs WHERE id = $1',
    [jobId]
  );
  return res.rows[0] ?? null;
}

/** Load by id + userId. Returns null if wrong user or not found. */
export async function getPipelineJob(jobId: string, userId: string): Promise<PipelineJob | null> {
  await ensureDataTables();
  const res = await pool.query<PipelineJob>(
    'SELECT * FROM pipeline_jobs WHERE id = $1 AND user_id = $2',
    [jobId, userId]
  );
  return res.rows[0] ?? null;
}

/** Cancel a job if it is pending or running and belongs to the user. Returns true if cancelled. */
export async function cancelPipelineJob(jobId: string, userId: string): Promise<boolean> {
  const job = await getPipelineJob(jobId, userId);
  if (!job || (job.status !== 'pending' && job.status !== 'running')) return false;
  await updatePipelineJobStatus(jobId, 'cancelled');
  return true;
}

export async function updatePipelineJobStatus(
  jobId: string,
  status: PipelineJobStatus,
  result?: unknown,
  error?: string,
  errorCode?: string | null
): Promise<void> {
  await ensureDataTables();
  const code = status === 'failed' ? (errorCode ?? null) : null;
  await pool.query(
    `UPDATE pipeline_jobs
     SET status = $1, result = $2::jsonb, error = $3, error_code = $4, updated_at = now()
     WHERE id = $5`,
    [status, result != null ? JSON.stringify(result) : null, error ?? null, code, jobId]
  );
}

export async function updatePipelineJobPhase(jobId: string, phase: string): Promise<void> {
  await ensureDataTables();
  await pool.query(
    'UPDATE pipeline_jobs SET phase = $1, updated_at = now() WHERE id = $2',
    [phase, jobId]
  );
}

export async function updatePipelineJobSubmit(jobId: string, submit: boolean): Promise<void> {
  await ensureDataTables();
  await pool.query(
    'UPDATE pipeline_jobs SET submit = $1, updated_at = now() WHERE id = $2',
    [submit, jobId]
  );
}

/** Set status to awaiting_approval and store minimal artifacts (e.g. jobTitle). */
export async function setPipelineJobAwaitingApproval(
  jobId: string,
  artifacts: Record<string, unknown>
): Promise<void> {
  await ensureDataTables();
  await pool.query(
    `UPDATE pipeline_jobs SET status = 'awaiting_approval', artifacts = $1::jsonb, updated_at = now() WHERE id = $2`,
    [JSON.stringify(artifacts), jobId]
  );
}

/** List recent pipeline jobs for a user (newest first). */
export async function listPipelineJobs(userId: string, limit = 20): Promise<PipelineJob[]> {
  await ensureDataTables();
  const res = await pool.query<PipelineJob>(
    'SELECT * FROM pipeline_jobs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
    [userId, limit]
  );
  return res.rows;
}

/** Find the most recent pipeline job for this user whose job_url matches the given job URL (after normalizing both). */
export async function getLatestPipelineJobByJobUrl(userId: string, jobUrl: string): Promise<PipelineJob | null> {
  const canonical = toHandshakeJobDetailsUrl(jobUrl);
  const jobs = await listPipelineJobs(userId, 50);
  for (const job of jobs) {
    if (job.job_url && toHandshakeJobDetailsUrl(job.job_url) === canonical) return job;
  }
  return null;
}
