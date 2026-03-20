/**
 * Per-user per-job state (resume basename, application submitted, applied at). Postgres-backed.
 */
import { pool, ensureDataTables } from '../api/db.js';
import { JobListing } from '../shared/job-finder-types.js';
import type { UserJobState } from '../shared/types.js';

/** Stable key for a job (site + jobId). */
export function toJobRef(site: string, jobId: string): string {
  if (!site || !jobId) return '';
  return `${site}:${jobId}`;
}

interface UserJobStateRow {
  resume_basename: string | null;
  application_submitted: boolean | null;
  applied_at: string | null;
  lifecycle_status: string | null;
  saved_at: string | null;
}

function rowToUserJobState(row: UserJobStateRow): UserJobState {
  return {
    resumeBasename: row.resume_basename ?? undefined,
    applicationSubmitted: row.application_submitted ?? undefined,
    appliedAt: row.applied_at ?? undefined,
    lifecycleStatus: (row.lifecycle_status as UserJobState['lifecycleStatus']) ?? undefined,
    savedAt: row.saved_at ?? undefined,
  };
}

export async function getUserJobState(userId: string, jobRef: string): Promise<UserJobState | null> {
  if (!userId || !jobRef) return null;
  await ensureDataTables();
  const res = await pool.query<UserJobStateRow>(
    'SELECT resume_basename, application_submitted, applied_at, lifecycle_status, saved_at FROM user_job_state WHERE user_id = $1 AND job_ref = $2',
    [userId, jobRef]
  );
  const row = res.rows[0];
  return row ? rowToUserJobState(row) : null;
}

export async function setUserJobState(
  userId: string,
  jobRef: string,
  payload: Partial<UserJobState>
): Promise<void> {
  if (!userId || !jobRef) return;
  await ensureDataTables();
  const existing = await getUserJobState(userId, jobRef);
  const merged = { ...existing, ...payload };
  await pool.query(
    `INSERT INTO user_job_state (user_id, job_ref, resume_basename, application_submitted, applied_at, lifecycle_status, saved_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, job_ref) DO UPDATE SET
       resume_basename = COALESCE(EXCLUDED.resume_basename, user_job_state.resume_basename),
       application_submitted = COALESCE(EXCLUDED.application_submitted, user_job_state.application_submitted),
       applied_at = COALESCE(EXCLUDED.applied_at, user_job_state.applied_at),
       lifecycle_status = COALESCE(EXCLUDED.lifecycle_status, user_job_state.lifecycle_status),
       saved_at = COALESCE(EXCLUDED.saved_at, user_job_state.saved_at),
       updated_at = now()`,
    [
      userId,
      jobRef,
      merged.resumeBasename ?? null,
      merged.applicationSubmitted ?? null,
      merged.appliedAt ?? null,
      merged.lifecycleStatus ?? null,
      merged.savedAt ?? null,
    ]
  );
}

/**
 * Upsert a lifecycle status for a job without touching other fields.
 * Uses a "do not downgrade" rule: submitted stays submitted.
 */
export async function setJobLifecycleStatus(
  userId: string,
  jobRef: string,
  status: 'saved' | 'in_progress' | 'submitted'
): Promise<void> {
  if (!userId || !jobRef) return;
  await ensureDataTables();
  const savedAt = status === 'saved' ? new Date().toISOString() : null;
  await pool.query(
    `INSERT INTO user_job_state (user_id, job_ref, lifecycle_status, saved_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, job_ref) DO UPDATE SET
       lifecycle_status = CASE
         WHEN user_job_state.lifecycle_status = 'submitted' AND $3 != 'submitted' THEN user_job_state.lifecycle_status
         ELSE $3
       END,
       saved_at = CASE WHEN $3 = 'saved' THEN COALESCE(user_job_state.saved_at, now()) ELSE user_job_state.saved_at END,
       updated_at = now()`,
    [userId, jobRef, status, savedAt]
  );
}

export interface LifecycleJobListing extends JobListing {
  lifecycleStatus?: string;
  savedAt?: string;
}

type LifecycleRow = {
  site: string;
  job_id: string;
  url: string;
  title: string | null;
  company: string | null;
  location: string | null;
  salary_employment_type: string | null;
  company_logo_url: string | null;
  application_submitted: boolean | null;
  applied_at: string | null;
  lifecycle_status: string | null;
  saved_at: string | null;
};

export async function getJobsByLifecycle(
  userId: string,
  status: 'saved' | 'in_progress' | 'submitted'
): Promise<LifecycleJobListing[]> {
  await ensureDataTables();
  let whereClause: string;
  const params: unknown[] = [userId];

  if (status === 'submitted') {
    whereClause = `(ujs.lifecycle_status = 'submitted' OR ujs.application_submitted = true)`;
  } else {
    whereClause = `ujs.lifecycle_status = $2`;
    params.push(status);
  }

  const res = await pool.query<LifecycleRow>(
    `SELECT
       j.site, j.job_id, j.url, j.title, j.company, j.location,
       j.salary_employment_type, j.company_logo_url,
       ujs.application_submitted, ujs.applied_at,
       ujs.lifecycle_status, ujs.saved_at
     FROM user_job_state ujs
     JOIN jobs j ON ujs.job_ref = CONCAT(j.site, ':', j.job_id)
     WHERE ujs.user_id = $1 AND ${whereClause}
     ORDER BY ujs.updated_at DESC`,
    params
  );

  return res.rows.map((r) => ({
    site: r.site,
    jobId: r.job_id,
    url: r.url,
    title: r.title ?? undefined,
    company: r.company ?? undefined,
    location: r.location ?? undefined,
    salaryEmploymentType: r.salary_employment_type ?? undefined,
    companyLogoUrl: r.company_logo_url ?? undefined,
    applicationSubmitted: r.application_submitted ?? undefined,
    appliedAt: r.applied_at ?? undefined,
    lifecycleStatus: r.lifecycle_status ?? undefined,
    savedAt: r.saved_at ?? undefined,
  }));
}

export async function getSubmittedJobs(userId: string): Promise<JobListing[]> {
  const res = await pool.query<{
    site: string
    job_id: string
    url: string
    title: string | null
    company: string | null
    location: string | null
    salary_employment_type: string | null
    company_logo_url: string | null
    application_submitted: boolean | null
    applied_at: string | null
  }>(
    `
    SELECT
      j.site,
      j.job_id,
      j.url,
      j.title,
      j.company,
      j.location,
      j.salary_employment_type,
      j.company_logo_url,
      ujs.application_submitted,
      ujs.applied_at
    FROM user_job_state ujs
    JOIN jobs j
      ON ujs.job_ref = CONCAT(j.site, ':', j.job_id)
    WHERE ujs.user_id = $1
      AND ujs.application_submitted = true
    ORDER BY ujs.applied_at DESC
    `,
    [userId]
  );

  return res.rows.map(r => ({
    site: r.site,
    jobId: r.job_id,
    url: r.url,
    title: r.title ?? undefined,
    company: r.company ?? undefined,
    location: r.location ?? undefined,
    salaryEmploymentType: r.salary_employment_type ?? undefined,
    companyLogoUrl: r.company_logo_url ?? undefined,
    applicationSubmitted: r.application_submitted ?? undefined,
    appliedAt: r.applied_at ?? undefined
  }));
}