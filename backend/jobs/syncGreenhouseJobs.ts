import cron from "node-cron";
import { pool } from "../api/db.js";
import { GreenhouseResponse, GreenhouseJob, JobRow } from "../types/jobs.js";

function stripHtml(html: string): string {
    return html
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function sanitize(str: string | null | undefined): string | null {
    if (!str) return null;
    // Remove null bytes which PostgreSQL rejects
    return str.replace(/\x00/g, "");
}

function buildJobRows(
    jobs: GreenhouseJob[],
    slug: string,
    companyName: string,
    now: string
): JobRow[] {
    return jobs.map((job) => ({
        site: "greenhouse",
        job_id: String(job.id),
        title: sanitize(job.title) ?? "",
        company: sanitize(companyName) ?? "",
        url: sanitize(job.absolute_url) ?? "",
        apply_type: "greenhouse",
        ats: "greenhouse",
        greenhouse_slug: slug,
        location: sanitize(job.location?.name),
        last_seen_at: now,
        updated_at: now,
        payload: {
            departments: job.departments ?? [],
            offices: job.offices ?? [],
            internal_job_id: job.internal_job_id ?? null,
            requisition_id: sanitize(job.requisition_id),
            first_published: sanitize(job.first_published),
        },
    }));
}

const UPSERT_SQL = `
  INSERT INTO jobs (
    site, job_id, title, company, url, apply_type, ats,
    greenhouse_slug, location, is_active, last_seen_at, updated_at, payload
  ) VALUES {PLACEHOLDERS}
  ON CONFLICT (site, job_id) DO UPDATE SET
    title            = EXCLUDED.title,
    company          = EXCLUDED.company,
    url              = EXCLUDED.url,
    apply_type       = EXCLUDED.apply_type,
    ats              = EXCLUDED.ats,
    greenhouse_slug  = EXCLUDED.greenhouse_slug,
    location         = EXCLUDED.location,
    is_active        = true,
    last_seen_at     = EXCLUDED.last_seen_at,
    updated_at       = EXCLUDED.updated_at,
    payload          = EXCLUDED.payload
`;

async function bulkUpsertJobs(jobs: JobRow[]): Promise<void> {
    if (!jobs.length) return;

    const values: unknown[] = [];
    const placeholders = jobs
        .map((job, i) => {
            const b = i * 13;
            values.push(
                job.site,
                job.job_id,
                job.title,
                job.company,
                job.url,
                job.apply_type,
                job.ats,
                job.greenhouse_slug,
                job.location,
                true,
                job.last_seen_at,
                job.updated_at,
                JSON.stringify(job.payload)
            );
            return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13})`;
        })
        .join(",");

    await pool.query(UPSERT_SQL.replace("{PLACEHOLDERS}", placeholders), values);
}

async function upsertJobsSafe(
    jobs: JobRow[],
    slug: string
): Promise<number> {
    try {
        await bulkUpsertJobs(jobs);
        return jobs.length;
    } catch (bulkErr) {
        // Bulk failed — fall back to per-job inserts so one bad row
        // doesn't discard the entire company's jobs
        console.warn(
            `[sync] Bulk upsert failed for ${slug}, falling back to per-job insert:`,
            bulkErr
        );
        let inserted = 0;
        for (const job of jobs) {
            try {
                await bulkUpsertJobs([job]);
                inserted++;
            } catch (jobErr) {
                console.error(
                    `[sync] Skipping job ${job.job_id} (${job.title}) for ${slug}:`,
                    jobErr
                );
            }
        }
        return inserted;
    }
}

async function fetchCompanyJobs(
    slug: string,
    companyName: string
): Promise<number> {
    try {
        const res = await fetch(
            `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
            { signal: AbortSignal.timeout(15_000) }
        );

        if (res.status === 404) return 0;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data: GreenhouseResponse = await res.json();
        if (!data.jobs?.length) return 0;

        const now = new Date().toISOString();
        const rows = buildJobRows(data.jobs, slug, companyName, now);

        return await upsertJobsSafe(rows, slug);
    } catch (err) {
        console.error(`[sync] Failed for ${slug}:`, err);
        return 0;
    }
}

async function markInactiveJobs(): Promise<void> {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    try {
        await pool.query(
            `UPDATE jobs
       SET is_active = false
       WHERE site = 'greenhouse'
         AND is_active = true
         AND last_seen_at < $1`,
            [cutoff]
        );
    } catch (err) {
        console.error("[sync] Failed to mark inactive jobs:", err);
    }
}

export async function syncAllCompanies(): Promise<void> {
    console.log("[sync] Starting Greenhouse sync...");
    const startedAt = Date.now();

    let companies: { greenhouse_slug: string; company_name: string }[];

    try {
        const { rows } = await pool.query<{
            greenhouse_slug: string;
            company_name: string;
        }>(
            `SELECT greenhouse_slug, company_name
       FROM greenhouse_companies
       WHERE is_active = true`
        );
        companies = rows;
    } catch (err) {
        console.error("[sync] Failed to fetch companies:", err);
        return;
    }

    if (!companies.length) {
        console.log("[sync] No companies found.");
        return;
    }
    console.log(`[sync] Syncing ${companies.length} companies...`);

    let totalJobs = 0;
    let failedCompanies = 0;

    const BATCH_SIZE = 10;
    for (let i = 0; i < companies.length; i += BATCH_SIZE) {
        const batch = companies.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
            batch.map((c) => fetchCompanyJobs(c.greenhouse_slug, c.company_name))
        );
        totalJobs += results.reduce((sum, n) => sum + n, 0);
        failedCompanies += results.filter((n) => n === 0).length;

        if (i + BATCH_SIZE < companies.length) {
            await new Promise((r) => setTimeout(r, 500));
        }
    }

    await markInactiveJobs();

    const duration = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
        `[sync] Done in ${duration}s — ${totalJobs} jobs synced, ${failedCompanies} companies failed or empty`
    );
}

// Run every night at 2am
cron.schedule("0 2 * * *", syncAllCompanies);
// syncAllCompanies().catch(console.error);