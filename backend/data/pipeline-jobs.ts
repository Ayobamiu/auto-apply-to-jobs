/**
 * Pipeline job storage: create, read, update status for async pipeline runs.
 */
import { pool, ensureDataTables } from '../api/db.js';
import { getJobIdFromUrl, getJobSiteFromUrl, toHandshakeJobDetailsUrl } from '../shared/job-from-url.js';

export type PipelineJobStatus = 'pending' | 'running' | 'done' | 'failed' | 'awaiting_approval' | 'cancelled';

/** Pending/running are always active. Awaiting approval is active for a limited window. */
export const ALWAYS_ACTIVE_STATUSES: PipelineJobStatus[] = ['pending', 'running'];
export const AWAITING_APPROVAL_ACTIVE_WINDOW_HOURS = 24;

/**
 * Canonical identity for a job URL used to dedupe user submissions.
 * For URLs that resolve to a known (site, jobId), use "site:jobId"; otherwise
 * fall back to the normalized URL. Two inputs yielding the same key refer to
 * the same job for the purpose of the queue.
 */
export function canonicalJobUrlKey(jobUrl: string): string {
  const site = getJobSiteFromUrl(jobUrl);
  const id = getJobIdFromUrl(jobUrl);
  if (site && id && site !== 'unknown') return `${site}:${id}`;
  return toHandshakeJobDetailsUrl(jobUrl);
}

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

/**
 * Count rows in the user's queue that are still in-flight for cap accounting:
 * pending/running always count; awaiting_approval counts only while fresh.
 */
export async function countInFlightByUser(userId: string): Promise<number> {
  await ensureDataTables();
  const res = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM pipeline_jobs
     WHERE user_id = $1
       AND (
         status = ANY($2::text[])
         OR (status = 'awaiting_approval' AND updated_at > now() - ($3 || ' hours')::interval)
       )`,
    [userId, ALWAYS_ACTIVE_STATUSES, String(AWAITING_APPROVAL_ACTIVE_WINDOW_HOURS)],
  );
  return Number(res.rows[0]?.count ?? '0');
}

/** Return the oldest pending pipeline job for the user, if any. */
export async function findOldestPendingForUser(userId: string): Promise<PipelineJob | null> {
  await ensureDataTables();
  const res = await pool.query<PipelineJob>(
    `SELECT * FROM pipeline_jobs
     WHERE user_id = $1 AND status = 'pending'
     ORDER BY created_at ASC
     LIMIT 1`,
    [userId],
  );
  return res.rows[0] ?? null;
}

/** Return true if the user already has any running pipeline row. */
export async function hasRunningPipelineJob(userId: string): Promise<boolean> {
  await ensureDataTables();
  const res = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM pipeline_jobs
     WHERE user_id = $1 AND status = 'running'`,
    [userId],
  );
  return Number(res.rows[0]?.count ?? '0') > 0;
}

/**
 * Find an existing in-flight pipeline row for the user whose canonical URL
 * matches the given jobUrl. Used to make POST /pipeline idempotent.
 */
export async function findInFlightByCanonicalUrl(
  userId: string,
  jobUrl: string,
): Promise<PipelineJob | null> {
  await ensureDataTables();
  const key = canonicalJobUrlKey(jobUrl);
  const res = await pool.query<PipelineJob>(
    `SELECT * FROM pipeline_jobs
     WHERE user_id = $1
       AND (
         status = ANY($2::text[])
         OR (status = 'awaiting_approval' AND updated_at > now() - ($3 || ' hours')::interval)
       )
     ORDER BY created_at DESC`,
    [userId, ALWAYS_ACTIVE_STATUSES, String(AWAITING_APPROVAL_ACTIVE_WINDOW_HOURS)],
  );
  for (const row of res.rows) {
    if (row.job_url && canonicalJobUrlKey(row.job_url) === key) return row;
  }
  return null;
}

/**
 * Slim projection for the queue tray endpoint.
 * Excludes large artifacts/result payloads on purpose.
 */
export interface ActivePipelineJob {
  id: string;
  job_url: string;
  status: PipelineJobStatus;
  phase: string | null;
  error_message: string | null;
  job_title: string | null;
  site: string | null;
  automation_level: string | null;
  submit: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * List the user's in-flight pipeline jobs plus jobs that recently reached a
 * terminal state (done/failed) in the last `recentTerminalMinutes` minutes, so
 * the UI can surface completions and errors briefly before they disappear.
 */
export async function listActivePipelineJobs(
  userId: string,
  recentTerminalMinutes = 15,
): Promise<ActivePipelineJob[]> {
  await ensureDataTables();
  const res = await pool.query<{
    id: string;
    job_url: string;
    status: PipelineJobStatus;
    phase: string | null;
    error: string | null;
    artifacts: Record<string, unknown> | null;
    automation_level: string | null;
    submit: boolean;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, job_url, status, phase, error, artifacts, automation_level, submit, created_at, updated_at
     FROM pipeline_jobs
     WHERE user_id = $1
       AND (
         status = ANY($2::text[])
         OR (status = 'awaiting_approval' AND updated_at > now() - ($3 || ' hours')::interval)
         OR (status IN ('done', 'failed') AND updated_at > now() - ($4 || ' minutes')::interval)
       )
     ORDER BY
       CASE
         WHEN status = 'awaiting_approval' THEN 0
         WHEN status = 'running' THEN 1
         WHEN status = 'pending' THEN 2
         WHEN status = 'failed' THEN 3
         WHEN status = 'done' THEN 4
         ELSE 5
       END,
       updated_at DESC`,
    [
      userId,
      ALWAYS_ACTIVE_STATUSES,
      String(AWAITING_APPROVAL_ACTIVE_WINDOW_HOURS),
      String(recentTerminalMinutes),
    ],
  );
  return res.rows.map((row) => {
    const artifacts = (row.artifacts ?? {}) as Record<string, unknown>;
    const jobTitle =
      typeof artifacts.jobTitle === 'string' && artifacts.jobTitle.trim()
        ? (artifacts.jobTitle as string)
        : null;
    const site = getJobSiteFromUrl(row.job_url) || null;
    return {
      id: row.id,
      job_url: row.job_url,
      status: row.status,
      phase: row.phase,
      error_message: row.error,
      job_title: jobTitle,
      site,
      automation_level: row.automation_level,
      submit: row.submit,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });
}

/**
 * Atomic enqueue with two guarantees:
 *   1. If an existing in-flight row for the same canonical URL is found,
 *      reuse it (idempotent on duplicate submission).
 *   2. Otherwise enforce `cap` on the user's total in-flight rows
 *      (pending/running always + fresh awaiting_approval) and INSERT a new row.
 *
 * Serialised per-user via `pg_advisory_xact_lock(hashtext(user_id))` so two
 * near-simultaneous POSTs cannot both slip under the cap.
 */
export async function enqueuePipelineJob(params: {
  userId: string;
  jobUrl: string;
  cap: number;
  submit: boolean;
  forceScrape: boolean;
  automationLevel: 'full' | 'review';
}): Promise<
  | { ok: true; jobId: string; reused: boolean; inFlight: number }
  | { ok: false; reason: 'queue_full'; inFlight: number; cap: number }
> {
  await ensureDataTables();
  const { userId, jobUrl, cap, submit, forceScrape, automationLevel } = params;
  const key = canonicalJobUrlKey(jobUrl);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`pipeline:${userId}`]);

    const existing = await client.query<PipelineJob>(
      `SELECT * FROM pipeline_jobs
       WHERE user_id = $1
         AND (
           status = ANY($2::text[])
           OR (status = 'awaiting_approval' AND updated_at > now() - ($3 || ' hours')::interval)
         )
       ORDER BY created_at DESC`,
      [userId, ALWAYS_ACTIVE_STATUSES, String(AWAITING_APPROVAL_ACTIVE_WINDOW_HOURS)],
    );
    const reusedMatch = existing.rows.find(
      (row) => row.job_url && canonicalJobUrlKey(row.job_url) === key,
    );
    if (reusedMatch) {
      await client.query('COMMIT');
      return { ok: true, jobId: reusedMatch.id, reused: true, inFlight: existing.rows.length };
    }

    if (existing.rows.length >= cap) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'queue_full', inFlight: existing.rows.length, cap };
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO pipeline_jobs (user_id, job_url, submit, force_scrape, automation_level)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [userId, jobUrl, submit, forceScrape, automationLevel],
    );
    await client.query('COMMIT');
    return {
      ok: true,
      jobId: inserted.rows[0].id,
      reused: false,
      inFlight: existing.rows.length + 1,
    };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}
