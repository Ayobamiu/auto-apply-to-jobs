/**
 * GET /jobs/search — search greenhouse (and future ATS) jobs from DB.
 * Full-text search on title + company + location, filtered by is_active.
 * No Handshake session required.
 */
import type { Request, Response } from 'express';
import { pool, ensureDataTables } from '../db.js';

interface SearchRow {
  site: string;
  job_id: string;
  title: string | null;
  company: string | null;
  url: string | null;
  location: string | null;
  salary_employment_type: string | null;
  company_logo_url: string | null;
  ats: string | null;
  greenhouse_slug: string | null;
  payload: Record<string, unknown> | null;
  last_seen_at: string | null;
}

export async function getJobsSearch(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  await ensureDataTables();

  const query = typeof req.query.query === 'string' ? req.query.query.trim() : '';
  const location = typeof req.query.location === 'string' ? req.query.location.trim() : '';
  const company = typeof req.query.company === 'string' ? req.query.company.trim() : '';
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(String(req.query.perPage ?? '30'), 10) || 30));
  const offset = (page - 1) * perPage;

  const conditions: string[] = ["site = 'greenhouse'", 'is_active = true'];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (query) {
    conditions.push(`to_tsvector('english', COALESCE(title,'') || ' ' || COALESCE(company,'') || ' ' || COALESCE(location,'')) @@ plainto_tsquery('english', $${paramIdx})`);
    params.push(query);
    paramIdx++;
  }

  if (location) {
    conditions.push(`location ILIKE $${paramIdx}`);
    params.push(`%${location}%`);
    paramIdx++;
  }

  if (company) {
    conditions.push(`company ILIKE $${paramIdx}`);
    params.push(`%${company}%`);
    paramIdx++;
  }

  const where = conditions.join(' AND ');

  const countRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM jobs WHERE ${where}`,
    params,
  );
  const totalCount = parseInt(countRes.rows[0]?.count ?? '0', 10);

  const dataRes = await pool.query<SearchRow>(
    `SELECT site, job_id, title, company, url, location, salary_employment_type,
            company_logo_url, ats, greenhouse_slug, payload, last_seen_at
     FROM jobs
     WHERE ${where}
     ORDER BY last_seen_at DESC NULLS LAST
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, perPage, offset],
  );

  const listings = dataRes.rows.map((r) => ({
    site: r.site,
    jobId: r.job_id,
    url: r.url ?? `https://boards.greenhouse.io/${r.greenhouse_slug ?? 'unknown'}/jobs/${r.job_id}`,
    title: r.title ?? undefined,
    company: r.company ?? undefined,
    location: r.location ?? undefined,
    salaryEmploymentType: r.salary_employment_type ?? undefined,
    companyLogoUrl: r.company_logo_url ?? undefined,
    ats: r.ats ?? undefined,
    greenhouseSlug: r.greenhouse_slug ?? undefined,
    departments: (r.payload as any)?.departments ?? [],
  }));

  res.status(200).json({
    listings,
    totalCount,
    page,
    perPage,
    totalPages: Math.ceil(totalCount / perPage),
  });
}
