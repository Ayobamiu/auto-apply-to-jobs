/**
 * Job scraper agent: fetch job by URL, scrape title/company/description, save to single jobs file (output/jobs.json).
 * Jobs are keyed by site + jobId; re-scrape is skipped if job already in store unless FORCE_SCRAPE=1 or --force.
 * Use SCRAPE_HEADED=1 for a visible browser (avoids bot-protection on Handshake).
 *
 * Usage:
 *   node agents/job_scraper_agent/index.js <job-url>
 *   FORCE_SCRAPE=1 node agents/job_scraper_agent/index.js <job-url>
 *   node agents/job_scraper_agent/index.js --force <job-url>
 */
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { getJobFromUrl, cacheKey, getJobIdFromUrl, getJobSiteFromUrl } from '../../shared/job-from-url.js';
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

function getJobUrl() {
  const env = process.env.JOB_URL;
  if (env) return env;
  const argv = process.argv.slice(2);
  const forceIdx = argv.findIndex((a) => a === '--force' || a === '-f');
  if (forceIdx !== -1) argv.splice(forceIdx, 1);
  return argv[0] || null;
}

function getForceScrape() {
  if (process.env.FORCE_SCRAPE === '1' || process.env.FORCE_SCRAPE === 'true') return true;
  return process.argv.includes('--force') || process.argv.includes('-f');
}

if (process.argv[1] === __filename) {
  const jobUrl = getJobUrl();
  if (!jobUrl) {
    console.error('Usage: node agents/job_scraper_agent/index.js [--force] <job-url>');
    console.error('   or: JOB_URL=<url> node agents/job_scraper_agent/index.js');
    console.error('   or: FORCE_SCRAPE=1 node agents/job_scraper_agent/index.js <job-url>');
    process.exit(1);
  }

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
