/**
 * GET /jobs/search — search greenhouse (and future ATS) jobs from DB.
 * Full-text search on title + company + location, filtered by is_active.
 * No Handshake session required.
 */
import type { Request, Response } from 'express';
import { pool, ensureDataTables } from '../db.js';

type SearchRow = {
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
  payload: unknown;
  last_seen_at: Date | null;
  saved_at: Date | null;
  lifecycle_status: string | null;
  application_submitted: boolean | null;
};

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

  // ------------------------------------------------------------------
  // Fetch user profile for boosting (title + location from payload)
  // ------------------------------------------------------------------
  const profileRes = await pool.query<{ payload: any }>(
    `SELECT payload FROM profiles WHERE user_id = $1`,
    [userId],
  );
  const profilePayload = profileRes.rows[0]?.payload ?? {};
  const profileTitle: string = profilePayload.title ?? '';
  const profileLocation: string = profilePayload.location ?? '';

  // ------------------------------------------------------------------
  // Build WHERE conditions
  // ------------------------------------------------------------------
  const conditions: string[] = ["j.site = 'greenhouse'", 'j.is_active = true'];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (query) {
    // websearch_to_tsquery is more forgiving of natural language input;
    // the weighted vector (A=title, B=company, C=location, D=description)
    // matches the new GIN index so Postgres can use it efficiently.
    conditions.push(`
      (
        setweight(to_tsvector('english', COALESCE(j.title,'')), 'A') ||
        setweight(to_tsvector('english', COALESCE(j.company,'')), 'B') ||
        setweight(to_tsvector('english', COALESCE(j.location,'')), 'C') ||
        setweight(to_tsvector('english', COALESCE(j.description,'')), 'D')
      ) @@ websearch_to_tsquery('english', $${paramIdx})
    `);
    params.push(query);
    paramIdx++;
  }

  if (location) {
    conditions.push(`j.location ILIKE $${paramIdx}`);
    params.push(`%${location}%`);
    paramIdx++;
  }

  if (company) {
    conditions.push(`j.company ILIKE $${paramIdx}`);
    params.push(`%${company}%`);
    paramIdx++;
  }

  // Exclude jobs the user has applied to, saved, rejected, or withdrawn
  conditions.push(`
    (ujs.user_id IS NULL
     OR (ujs.application_submitted IS NOT TRUE
         AND ujs.lifecycle_status NOT IN ('rejected', 'withdrawn')))
  `);

  const where = conditions.join(' AND ');

  // ------------------------------------------------------------------
  // Relevance score expression (reused in both COUNT and data queries)
  // ------------------------------------------------------------------
  // Base: ts_rank on weighted FTS vector
  // Boost: +0.2 if job title contains profile title keywords
  //        +0.1 if job location contains profile location keywords
  const buildRankExpr = (pIdx: number): { expr: string; extraParams: unknown[] } => {
    const extraParams: unknown[] = [];
    let expr = '';

    if (query) {
      expr += `
        ts_rank(
          setweight(to_tsvector('english', COALESCE(j.title,'')), 'A') ||
          setweight(to_tsvector('english', COALESCE(j.company,'')), 'B') ||
          setweight(to_tsvector('english', COALESCE(j.location,'')), 'C') ||
          setweight(to_tsvector('english', COALESCE(j.description,'')), 'D'),
          websearch_to_tsquery('english', $${pIdx})
        )
      `;
      extraParams.push(query);
      pIdx++;
    } else {
      expr += '0.0';
    }

    if (profileTitle) {
      expr += ` + CASE WHEN j.title ILIKE $${pIdx} THEN 0.2 ELSE 0 END`;
      extraParams.push(`%${profileTitle}%`);
      pIdx++;
    }

    if (profileLocation) {
      expr += ` + CASE WHEN j.location ILIKE $${pIdx} THEN 0.1 ELSE 0 END`;
      extraParams.push(`%${profileLocation}%`);
      pIdx++;
    }

    return { expr: `(${expr})`, extraParams };
  };

  // ------------------------------------------------------------------
  // COUNT query
  // ------------------------------------------------------------------
  const countRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM jobs j
     LEFT JOIN user_job_state ujs
       ON ujs.job_ref = j.site || ':' || j.job_id
      AND ujs.user_id = $${paramIdx}
     WHERE ${where}`,
    [...params, userId],
  );
  const totalCount = parseInt(countRes.rows[0]?.count ?? '0', 10);

  // paramIdx for the data query starts where WHERE params ended (after userId)
  const userIdParamIdx = paramIdx;       // used in JOIN
  paramIdx++;                             // advance past userId

  // ------------------------------------------------------------------
  // Build rank expression for ORDER BY (params appended after userId)
  // ------------------------------------------------------------------
  const { expr: rankExpr, extraParams: rankParams } = buildRankExpr(paramIdx);
  paramIdx += rankParams.length;

  const limitParamIdx = paramIdx;
  const offsetParamIdx = paramIdx + 1;

  // ------------------------------------------------------------------
  // DATA query — interleave with ROW_NUMBER so no company clusters
  // ------------------------------------------------------------------

  const dataRes = await pool.query<SearchRow>(
    `WITH ranked AS (
       SELECT
         j.site, j.job_id, j.title, j.company, j.url, j.location,
         j.salary_employment_type, j.company_logo_url, j.ats,
         j.greenhouse_slug, j.payload, j.last_seen_at,
         ujs.saved_at, ujs.lifecycle_status, ujs.application_submitted,
         ${rankExpr} AS relevance_score,
         ROW_NUMBER() OVER (
           PARTITION BY j.company
           ORDER BY ${rankExpr} DESC, j.last_seen_at DESC NULLS LAST
         ) AS company_rank
       FROM jobs j
       LEFT JOIN user_job_state ujs
         ON ujs.job_ref = j.site || ':' || j.job_id
        AND ujs.user_id = $${userIdParamIdx}
       WHERE ${where}
     )
     SELECT *
     FROM ranked
     ORDER BY company_rank ASC, relevance_score DESC, last_seen_at DESC NULLS LAST
     LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}`,
    [...params, userId, ...rankParams, perPage, offset],
  );

  const listings = dataRes.rows.map((r) => ({
    site: r.site,
    jobId: r.job_id,
    url: r.url,
    title: r.title ?? undefined,
    company: r.company ?? undefined,
    location: r.location ?? undefined,
    salaryEmploymentType: r.salary_employment_type ?? undefined,
    companyLogoUrl: r.company_logo_url ?? undefined,
    ats: r.ats ?? undefined,
    greenhouseSlug: r.greenhouse_slug ?? undefined,
    departments: (r.payload as any)?.departments ?? [],
    // State fields for frontend badges
    savedAt: r.saved_at ?? undefined,
    lifecycleStatus: r.lifecycle_status ?? undefined,
    applicationSubmitted: r.application_submitted ?? false,
  }));

  res.status(200).json({
    listings,
    totalCount,
    page,
    perPage,
    totalPages: Math.ceil(totalCount / perPage),
  });
}
