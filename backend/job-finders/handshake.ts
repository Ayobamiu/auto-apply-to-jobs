/**
 * Handshake job finder: uses the user's saved session to load the job search page
 * and scrape job links. No public API; requires authenticated session.
 */
import { getHandshakeSessionPath } from '../data/handshake-session.js';
import { getJobIdFromUrl, toHandshakeJobDetailsUrl } from '../shared/job-from-url.js';
import { launchBrowser } from '../shared/browser.js';
import { AppError, CODES } from '../shared/errors.js';
import { PAGE_GOTO_TIMEOUT_MS, POST_NAVIGATE_DELAY_MS } from '../shared/constants.js';
import type { JobFinder, JobListing, FindJobsOptions, SearchFilters } from '../shared/job-finder-types.js';

const HANDSHAKE_JOBS_BASE = process.env.HANDSHAKE_JOBS_BASE_URL || 'https://wmich.joinhandshake.com';
const JOB_SEARCH_PATH = '/job-search';

const DEFAULT_PER_PAGE = 50;

function buildHandshakeSearchUrl(base: string, filters: SearchFilters | undefined, page: number, perPage: number): string {
  const params = new URLSearchParams();
  if (filters?.query?.trim()) params.set('query', filters.query.trim());
  if (filters?.employmentTypes?.length) filters.employmentTypes.forEach((v) => params.append('employmentTypes', v));
  if (filters?.jobTypes?.length) filters.jobTypes.forEach((v) => params.append('jobType', v));
  if (filters?.remoteWork?.length) filters.remoteWork.forEach((v) => params.append('remoteWork', v));
  if (filters?.workAuthorization?.length) filters.workAuthorization.forEach((v) => params.append('workAuthorization', v));
  params.set('page', String(page));
  params.set('per_page', String(perPage));

  const locationFilter = filters?.handshake?.locationFilter;
  if (locationFilter != null) {
    const json = typeof locationFilter === 'string' ? locationFilter : JSON.stringify(locationFilter);
    params.set('locationFilter', encodeURIComponent(json));
  }

  const qs = params.toString();
  return `${base}${JOB_SEARCH_PATH}${qs ? `?${qs}` : ''}`;
}

export const handshakeJobFinder: JobFinder = {
  async findJobs(userId: string, options?: FindJobsOptions): Promise<JobListing[]> {
    const storagePath = await getHandshakeSessionPath(userId);
    if (!storagePath) {
      throw new AppError(CODES.NO_SESSION);
    }

    const maxResults = options?.maxResults ?? 50;
    const filters = options?.filters;
    const pagination = filters?.pagination;
    const perPageForRequest = Math.min(50, pagination?.perPage ?? 50);
    const base = HANDSHAKE_JOBS_BASE.replace(/\/$/, '');

    const browser = await launchBrowser({ headless: true });
    const context = await browser.newContext({ storageState: storagePath });
    const page = await context.newPage();

    try {
      const allRows: { jobId: string; url: string; title?: string; company?: string; location?: string; salaryEmploymentType?: string; companyLogoUrl?: string }[] = [];
      let currentPage = pagination?.page ?? 1;
      const seenIds = new Set<string>();

      while (allRows.length < maxResults) {
        const jobSearchUrl = buildHandshakeSearchUrl(base, filters, currentPage, perPageForRequest);
        await page.goto(jobSearchUrl, { waitUntil: 'domcontentloaded', timeout: PAGE_GOTO_TIMEOUT_MS });
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => { });
        await new Promise((r) => setTimeout(r, POST_NAVIGATE_DELAY_MS));

        const currentUrl = page.url();
        const origin = new URL(currentUrl).origin;
        const host = new URL(currentUrl).hostname.toLowerCase();
        const isLoginPage =
          host.includes('login') || host.includes('sso.') || host.includes('webauth.') || host.includes('idp.');
        if (isLoginPage) {
          throw new AppError(CODES.SESSION_EXPIRED);
        }

        for (let s = 0; s < 15; s++) {
          const prevCount = await page.evaluate(() => document.querySelectorAll('[data-hook^="job-result-card |"]').length);
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await new Promise((r) => setTimeout(r, 800));
          const nextCount = await page.evaluate(() => document.querySelectorAll('[data-hook^="job-result-card |"]').length);
          if (nextCount <= prevCount) break;
        }

        interface ScrapedRow {
          jobId: string;
          url: string;
          title?: string;
          company?: string;
          location?: string;
          salaryEmploymentType?: string;
          companyLogoUrl?: string;
        }

        const listings = await page.evaluate(
          ({ baseOrigin }: { baseOrigin: string }): ScrapedRow[] => {
            const cards = document.querySelectorAll<HTMLDivElement>('div[data-hook^="job-result-card |"]');
            const results: ScrapedRow[] = [];
            for (const card of cards) {
              const dataHook = card.getAttribute('data-hook') || '';
              const parts = dataHook.split('|').map((p) => p.trim());
              const jobId = parts[1] || '';
              if (!jobId) continue;
              const url = `${baseOrigin}/jobs/${jobId}`;

              let company: string | undefined;
              let companyLogoUrl: string | undefined;
              const img = card.querySelector('img[src]');
              if (img) {
                const src = img.getAttribute('src');
                if (src) companyLogoUrl = src;
                const alt = img.getAttribute('alt');
                if (alt) company = alt.trim();
              }

              const titleEl = card.querySelector('div[aria-label^="View "]');
              const title = titleEl ? (titleEl.textContent || '').trim() || undefined : undefined;

              const salaryEl = card.querySelector('.sc-ezucZL.FLVWv');
              const salaryEmploymentType = salaryEl ? (salaryEl.textContent || '').trim() || undefined : undefined;

              const footer = card.querySelector('[data-hook="job-result-card-footer"]');
              let location: string | undefined;
              if (footer) {
                const locSpan = footer.querySelector('.sc-hPGmpy.iGVZxL');
                if (locSpan) location = (locSpan.textContent || '').trim() || undefined;
              }

              results.push({ jobId, url, title, company, location, salaryEmploymentType, companyLogoUrl });
            }
            return results;
          },
          { baseOrigin: origin }
        );

        let added = 0;
        for (const row of listings) {
          if (seenIds.has(row.jobId)) continue;
          seenIds.add(row.jobId);
          allRows.push(row);
          added++;
          if (allRows.length >= maxResults) break;
        }
        if (listings.length === 0 || allRows.length >= maxResults) break;
        currentPage++;
        if (currentPage > 2) break;
      }

      let out: JobListing[] = [];
      for (const row of allRows) {
        const canonicalUrl = toHandshakeJobDetailsUrl(row.url);
        const jobId = getJobIdFromUrl(canonicalUrl);
        if (jobId) {
          out.push({
            site: 'handshake',
            jobId,
            url: canonicalUrl,
            title: row.title,
            company: row.company,
            location: row.location,
            salaryEmploymentType: row.salaryEmploymentType,
            companyLogoUrl: row.companyLogoUrl,
          });
        }
      }

      return out;
    } finally {
      await browser.close();
    }
  },
};
