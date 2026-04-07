/**
 * Jobs data: scraped jobs keyed by site + jobId. Postgres-backed.
 */
import { pool, ensureDataTables } from '../api/db.js';
import type { Job } from '../shared/types.js';

export type JobsData = Record<string, Record<string, Job>>;

const CANONICAL_KEYS = [
  'title',
  'company',
  'description',
  'url',
  'jobId',
  'site',
  'applyType',
  'jobClosed',
  'location',
  'salaryEmploymentType',
  'companyLogoUrl',
] as const;

interface JobRow {
  site: string;
  job_id: string;
  title: string | null;
  company: string | null;
  description: string | null;
  url: string | null;
  apply_type: string | null;
  job_closed: boolean | null;
  location: string | null;
  salary_employment_type: string | null;
  company_logo_url: string | null;
  payload: Record<string, unknown>;
}

function rowToJob(row: JobRow): Job {
  const job: Job = {
    jobId: row.job_id,
    site: row.site,
    title: row.title ?? undefined,
    company: row.company ?? undefined,
    description: row.description ?? undefined,
    url: row.url ?? undefined,
    applyType: row.apply_type ?? undefined,
    jobClosed: row.job_closed ?? undefined,
    location: row.location ?? undefined,
    salaryEmploymentType: row.salary_employment_type ?? undefined,
    companyLogoUrl: row.company_logo_url ?? undefined,
    ...(row.payload && typeof row.payload === 'object' ? row.payload : {}),
  };
  return job;
}

export async function getJob(site: string, id: string): Promise<Job | null> {
  if (!site || !id) return null;
  await ensureDataTables();
  const res = await pool.query<JobRow>(
    'SELECT site, job_id, title, company, description, url, apply_type, job_closed, location, salary_employment_type, company_logo_url, payload FROM jobs WHERE site = $1 AND job_id = $2',
    [site, id]
  );
  const row = res.rows[0];
  return row ? rowToJob(row) : null;
}

export async function updateJob(
  site: string,
  id: string,
  payload: Partial<Job> & { jobId?: string; site?: string }
): Promise<void> {
  if (!site || !id) return;
  await ensureDataTables();
  const existing = await getJob(site, id);
  const merged: Job = {
    ...(existing || { jobId: id, site }),
    ...payload,
    jobId: id,
    site,
  };
  const title = merged.title ?? null;
  const company = merged.company ?? null;
  const description = merged.description ?? null;
  const url = merged.url ?? null;
  const applyType = merged.applyType ?? null;
  const jobClosed = merged.jobClosed ?? null;
  const isActive = merged.isActive ?? false;
  const location = merged.location ?? null;
  const salaryEmploymentType = merged.salaryEmploymentType ?? null;
  const companyLogoUrl = merged.companyLogoUrl ?? null;
  const payloadJson: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(merged)) {
    if (k === 'jobId' || k === 'site' || CANONICAL_KEYS.includes(k as (typeof CANONICAL_KEYS)[number])) continue;
    payloadJson[k] = v;
  }
  await pool.query(
    `INSERT INTO jobs (site, job_id, title, company, description, url, apply_type, job_closed, is_active, location, salary_employment_type, company_logo_url, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
     ON CONFLICT (site, job_id) DO UPDATE SET
       title = EXCLUDED.title,
       company = EXCLUDED.company,
       description = EXCLUDED.description,
       url = EXCLUDED.url,
       apply_type = EXCLUDED.apply_type,
       job_closed = EXCLUDED.job_closed,
       is_active = EXCLUDED.is_active,
       location = EXCLUDED.location,
       salary_employment_type = EXCLUDED.salary_employment_type,
       company_logo_url = EXCLUDED.company_logo_url,
       payload = EXCLUDED.payload,
       updated_at = now()`,
    [site, id, title, company, description, url, applyType, jobClosed, isActive, location, salaryEmploymentType, companyLogoUrl, JSON.stringify(payloadJson)]
  );
}

export async function listJobs(): Promise<JobsData> {
  await ensureDataTables();
  const res = await pool.query<JobRow>(
    'SELECT site, job_id, title, company, description, url, apply_type, job_closed, location, salary_employment_type, company_logo_url, payload FROM jobs'
  );
  const data: JobsData = {};
  for (const row of res.rows) {
    if (!data[row.site]) data[row.site] = {};
    data[row.site][row.job_id] = rowToJob(row);
  }
  return data;
}
