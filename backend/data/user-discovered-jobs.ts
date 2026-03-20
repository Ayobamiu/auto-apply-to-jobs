/**
 * Per-user discovered jobs cache: persist and read from user_discovered_jobs;
 * enrich from global jobs table; optional in-memory filter.
 * v1: only query and location are applied; employment/remote/work-auth can be added when listing schema has those fields.
 */
import { pool, ensureDataTables } from '../api/db.js';
import { getJob, updateJob } from './jobs.js';
import type { JobListing } from '../shared/job-finder-types.js';
import type { JobSearchFilters } from './user-preferences.js';

const HANDSHAKE_JOBS_BASE = process.env.HANDSHAKE_JOBS_BASE_URL || process.env.HANDSHAKE_JOBS_BASE || 'https://wmich.joinhandshake.com';

function parseJobRef(jobRef: string): { site: string; jobId: string } | null {
  const i = jobRef.indexOf(':');
  if (i <= 0 || i === jobRef.length - 1) return null;
  return { site: jobRef.slice(0, i), jobId: jobRef.slice(i + 1) };
}

function buildMinimalUrl(site: string, jobId: string): string {
  if (site === 'handshake') {
    const base = HANDSHAKE_JOBS_BASE.replace(/\/$/, '');
    return `${base}/jobs/${jobId}`;
  }
  return `https://${site}/jobs/${jobId}`;
}

/** v1: apply only query and location; other filter fields (employmentTypes, jobTypes, remoteWork, workAuthorization) reserved for when listing schema includes them. */
function applyFilters(listings: JobListing[], filters: JobSearchFilters | null): JobListing[] {
  if (!filters || (!filters.query?.trim() && !filters.location?.trim())) return listings;
  const q = filters.query?.trim().toLowerCase();
  const loc = filters.location?.trim().toLowerCase();
  return listings.filter((j) => {
    if (q) {
      const inTitle = j.title?.toLowerCase().includes(q);
      const inCompany = j.company?.toLowerCase().includes(q);
      if (!inTitle && !inCompany) return false;
    }
    if (loc) {
      const inTitle = j.title?.toLowerCase().includes(loc);
      const inCompany = j.company?.toLowerCase().includes(loc);
      const inLocation = j.location?.toLowerCase().includes(loc);
      if (!inTitle && !inCompany && !inLocation) return false;
    }
    return true;
  });
}

/**
 * create table public.user_discovered_jobs (
  user_id text not null,
  job_ref text not null,
  discovered_at timestamp with time zone null default now(),
  constraint user_discovered_jobs_pkey primary key (user_id, job_ref)
) TABLESPACE pg_default;

create table public.user_job_state (
  user_id text not null,
  job_ref text not null,
  resume_basename text null,
  application_submitted boolean null,
  applied_at text null,
  updated_at timestamp with time zone null default now(),
  constraint user_job_state_pkey primary key (user_id, job_ref)
) TABLESPACE pg_default;

Given these two tables, getDiscoveredJobRefs should return the job_ref for the user_discovered_jobs table. and match the job_ref with the job_ref in the user_job_state table to get the application_submitted and applied_at fields.
 */
export async function getDiscoveredJobRefs(
  userId: string,
  limit: number = 100
): Promise<{
  job_ref: string
  application_submitted: boolean | null
  applied_at: string | null
}[]> {

  if (!userId) return [];

  await ensureDataTables();

  const res = await pool.query<{
    job_ref: string
    application_submitted: boolean | null
    applied_at: string | null
  }>(
    `
    SELECT
      user_discovered_jobs.job_ref,
      user_job_state.application_submitted,
      user_job_state.applied_at
    FROM user_discovered_jobs
    LEFT JOIN user_job_state
      ON user_discovered_jobs.job_ref = user_job_state.job_ref
      AND user_discovered_jobs.user_id = user_job_state.user_id
    WHERE user_discovered_jobs.user_id = $1
    ORDER BY user_discovered_jobs.discovered_at DESC
    LIMIT $2
    `,
    [userId, limit]
  );

  return res.rows;
}

export async function saveDiscoveredJobs(userId: string, listings: JobListing[]): Promise<void> {
  if (!userId) return;
  await ensureDataTables();
  for (const j of listings) {
    const jobRef = `${j.site}:${j.jobId}`;
    await pool.query(
      `INSERT INTO user_discovered_jobs (user_id, job_ref, discovered_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id, job_ref) DO UPDATE SET discovered_at = now()`,
      [userId, jobRef]
    );
    await updateJob(j.site, j.jobId, {
      url: j.url,
      title: j.title,
      company: j.company,
      location: j.location,
      salaryEmploymentType: j.salaryEmploymentType,
      companyLogoUrl: j.companyLogoUrl,
    });
  }
}

export async function getCachedListings(
  userId: string,
  limit: number = 100,
  filters: JobSearchFilters | null = null
): Promise<JobListing[]> {
  const refs = await getDiscoveredJobRefs(userId, limit);
  const listings: JobListing[] = [];
  for (const { job_ref, application_submitted, applied_at } of refs) {
    const parsed = parseJobRef(job_ref);
    if (!parsed) continue;
    const { site, jobId } = parsed;
    const job = await getJob(site, jobId);
    if (job) {
      listings.push({
        site,
        jobId,
        url: job.url || buildMinimalUrl(site, jobId),
        title: job.title,
        company: job.company,
        location: job.location,
        salaryEmploymentType: job.salaryEmploymentType,
        companyLogoUrl: job.companyLogoUrl,
        applicationSubmitted: application_submitted ?? false,
        appliedAt: applied_at ?? undefined,
      });
    } else {
      listings.push({
        site,
        jobId,
        url: buildMinimalUrl(site, jobId),
        applicationSubmitted: application_submitted ?? false,
        appliedAt: applied_at ?? undefined,
      });
    }
  }
  return applyFilters(listings, filters);
}
