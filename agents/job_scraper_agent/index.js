/**
 * Job scraper agent: fetch job by URL, scrape title/company/description, save to single jobs file (output/jobs.json).
 * Jobs are keyed by site + jobId; re-scrape is skipped if job already in store unless FORCE_SCRAPE=1 or --force.
 * Use SCRAPE_HEADED=1 for a visible browser (avoids bot-protection on Handshake).
 * Loads .env when run standalone.
 *
 * Usage:
 *   node agents/job_scraper_agent/index.js <job-url>
 *   FORCE_SCRAPE=1 node agents/job_scraper_agent/index.js <job-url>
 *   node agents/job_scraper_agent/index.js --force <job-url>
 */
import 'dotenv/config';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { getJobFromUrl, getApplicationStatusFromUrl, cacheKey, getJobIdFromUrl, getJobSiteFromUrl, toHandshakeJobDetailsUrl } from '../../shared/job-from-url.js';
import { getJob as getStoredJob, setJob as setStoredJob } from '../../shared/jobs-store.js';
import { PATHS } from '../../shared/config.js';

const __filename = fileURLToPath(import.meta.url);

/**
 * @param {string} jobUrl - Job URL (e.g. handshake job-search/12345?...)
 * @param {{ cacheDir?: string, headless?: boolean, useAuth?: boolean, maxAgeMs?: number, forceScrape?: boolean }} [options]
 * @returns {Promise<{ job: object, jobsFilePath: string, fromStore?: boolean, htmlPath?: string | null }>}
 */
export async function runJobScraper(jobUrl, options = {}) {
  const cacheDir = options.cacheDir ?? PATHS.jobCache;
  const jobId = getJobIdFromUrl(jobUrl);
  const site = getJobSiteFromUrl(jobUrl);
  const forceScrape = options.forceScrape ?? (process.env.FORCE_SCRAPE === '1' || process.env.FORCE_SCRAPE === 'true');

  if (jobId && site && !forceScrape) {
    const stored = getStoredJob(site, jobId);
    if (stored) {
      return {
        job: stored,
        jobsFilePath: PATHS.jobsFile,
        fromStore: true,
      };
    }
  }

  const job = await getJobFromUrl(jobUrl, {
    cacheDir: options.cacheDir,
    headless: options.headless,
    useAuth: options.useAuth,
  });

  const fileKey = jobId || cacheKey(jobUrl);
  const htmlPath = join(cacheDir, `${fileKey}.html`);

  if (jobId && site) {
    const payload = {
      title: job.title,
      company: job.company,
      description: job.description,
      url: job.url,
      jobId: job.jobId ?? jobId,
      applyType: job.applyType,
      applicationSubmitted: job.applicationSubmitted,
    };
    if (job.appliedAt != null) payload.appliedAt = job.appliedAt;
    setStoredJob(site, jobId, payload);
  }

  return {
    job: { ...job, jobId: job.jobId ?? jobId, site },
    jobsFilePath: PATHS.jobsFile,
    fromStore: false,
    htmlPath: existsSync(htmlPath) ? htmlPath : null,
  };
}

/**
 * Get application-submitted status only (no full scrape). Checks store first; if not found and not fromStoreOnly, loads page and checks "Applied on" banner.
 * @param {string} jobUrl
 * @param {{ fromStoreOnly?: boolean }} [options] - If true, only return from store; never open browser.
 * @returns {Promise<{ applicationSubmitted: boolean, appliedAt?: string, fromStore?: boolean }>}
 */
export async function getApplicationStatus(jobUrl, options = {}) {
  const jobId = getJobIdFromUrl(jobUrl);
  const site = getJobSiteFromUrl(jobUrl);

  if (jobId && site) {
    const stored = getStoredJob(site, jobId);
    if (stored) {
      return {
        applicationSubmitted: !!stored.applicationSubmitted,
        ...(stored.appliedAt != null && { appliedAt: stored.appliedAt }),
        fromStore: true,
      };
    }
  }

  if (options.fromStoreOnly) {
    return { applicationSubmitted: false, fromStore: false };
  }

  const result = await getApplicationStatusFromUrl(jobUrl);
  return { ...result, fromStore: false };
}

function getJobUrl() {
  const env = process.env.JOB_URL;
  const argv = process.argv.slice(2);
  const forceIdx = argv.findIndex((a) => a === '--force' || a === '-f');
  if (forceIdx !== -1) argv.splice(forceIdx, 1);
  const statusIdx = argv.findIndex((a) => a === '--status' || a === '-s');
  if (statusIdx !== -1) argv.splice(statusIdx, 1);
  const raw = env || argv[0] || null;
  return raw ? toHandshakeJobDetailsUrl(raw) : null;
}

function getForceScrape() {
  if (process.env.FORCE_SCRAPE === '1' || process.env.FORCE_SCRAPE === 'true') return true;
  return process.argv.includes('--force') || process.argv.includes('-f');
}

function isStatusOnly() {
  return process.argv.includes('--status') || process.argv.includes('-s');
}

if (process.argv[1] === __filename) {
  const jobUrl = getJobUrl();
  if (!jobUrl) {
    console.error('Usage: node agents/job_scraper_agent/index.js [--force] <job-url>');
    console.error('       node agents/job_scraper_agent/index.js --status <job-url>   # application status only');
    console.error('   or: JOB_URL=<url> node agents/job_scraper_agent/index.js');
    console.error('   or: FORCE_SCRAPE=1 node agents/job_scraper_agent/index.js <job-url>');
    process.exit(1);
  }

  if (isStatusOnly()) {
    getApplicationStatus(jobUrl, { fromStoreOnly: false })
      .then(({ applicationSubmitted, appliedAt, fromStore }) => {
        if (fromStore) console.log('(from store)');
        console.log('Application submitted:', applicationSubmitted ? (appliedAt ?? 'yes') : 'no');
        if (appliedAt) console.log('Applied at:', appliedAt);
      })
      .catch((err) => {
        console.error(err);
        process.exit(1);
      });
  } else {
    runJobScraper(jobUrl, { forceScrape: getForceScrape() })
    .then(({ job, jobsFilePath, fromStore, htmlPath }) => {
      if (fromStore) console.log('(from store, skip re-scrape; use --force or FORCE_SCRAPE=1 to re-scrape)');
      console.log('Job:', job?.title || job?.company || jobUrl);
      if (job?.jobId) console.log('Job ID:', job.jobId);
      if (job?.site) console.log('Site:', job.site);
      console.log('Apply:', job?.applyType ?? 'unknown');
      if (job?.applicationSubmitted) console.log('Application submitted:', job.appliedAt ?? 'yes');
      else console.log('Application submitted: no');
      console.log('Description length:', job?.description?.length ?? 0);
      console.log('Jobs file:', jobsFilePath);
      if (htmlPath) console.log('HTML:', htmlPath);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
}
