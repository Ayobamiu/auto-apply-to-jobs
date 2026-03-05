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

const HANDSHAKE_JOBS_BASE = process.env.HANDSHAKE_JOBS_BASE_URL || process.env.HANDSHAKE_JOBS_BASE || 'https://wmich.joinhandshake.com';
const JOB_SEARCH_PATH = '/job-search';

const DEFAULT_PER_PAGE = 50;

function buildHandshakeSearchUrl(base: string, filters: SearchFilters | undefined, page: number, perPage: number): string {
  const params = new URLSearchParams();
  if (filters?.query?.trim()) params.set('query', filters.query.trim());
  (filters?.employmentTypes ?? []).forEach((v) => params.append('employmentTypes', v));
  (filters?.jobTypes ?? []).forEach((v) => params.append('jobType', v));
  (filters?.remoteWork ?? []).forEach((v) => params.append('remoteWork', v));
  (filters?.workAuthorization ?? []).forEach((v) => params.append('workAuthorization', v));
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
      const allRows: { jobId: string; url: string; title?: string; company?: string }[] = [];
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
          const prevCount = await page.evaluate(() => document.querySelectorAll('a[href*="/jobs/"]').length);
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await new Promise((r) => setTimeout(r, 800));
          const nextCount = await page.evaluate(() => document.querySelectorAll('a[href*="/jobs/"]').length);
          if (nextCount <= prevCount) break;
        }

        const listings = await page.evaluate(
          ({ baseOrigin }: { baseOrigin: string }) => {
            const seen = new Set<string>();
            const results: { jobId: string; url: string; title?: string; company?: string }[] = [];
            const links = document.querySelectorAll<HTMLAnchorElement>('a[href*="/jobs/"]');
            for (const a of links) {
              const href = a.getAttribute('href');
              if (!href) continue;
              const fullHref = href.startsWith('http') ? href : `${baseOrigin}${href.startsWith('/') ? '' : '/'}${href}`;
              const idMatch = fullHref.match(/\/jobs\/(\d+)/) || fullHref.match(/job-search\/(\d+)/);
              const jobId = idMatch ? idMatch[1] : null;
              if (!jobId || seen.has(jobId)) continue;
              seen.add(jobId);
              const url = `${baseOrigin}/jobs/${jobId}`;
              let title: string | undefined;
              let company: string | undefined;
              const card = a.closest('[class*="sc-"]') || a.closest('div[class]') || a.parentElement;
              if (card) {
                const h1 = card.querySelector('h1');
                if (h1) title = h1.textContent?.trim() || undefined;
                const companyLink = card.querySelector('a[href^="/e/"]');
                if (companyLink) company = companyLink.getAttribute('aria-label')?.trim() || companyLink.textContent?.trim() || undefined;
              }
              if (!title && a.textContent) title = a.textContent.trim().slice(0, 200) || undefined;
              results.push({ jobId, url, title, company });
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
          });
        }
      }
      if (filters?.query?.trim() || filters?.location?.trim()) {
        const q = filters.query?.trim().toLowerCase();
        const loc = filters.location?.trim().toLowerCase();
        out = out.filter((j) => {
          if (q && !j.title?.toLowerCase().includes(q) && !j.company?.toLowerCase().includes(q)) return false;
          if (loc && !j.title?.toLowerCase().includes(loc) && !j.company?.toLowerCase().includes(loc)) return false;
          return true;
        });
      }
      return out;
    } finally {
      await browser.close();
    }
  },
};
