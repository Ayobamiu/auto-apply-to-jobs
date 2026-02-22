/**
 * Job scraper agent: fetch job by URL, scrape title/company/description, save to jobs file.
 */
import 'dotenv/config';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import {
  getJobFromUrl,
  getApplicationStatusFromUrl,
  cacheKey,
  getJobIdFromUrl,
  getJobSiteFromUrl,
  toHandshakeJobDetailsUrl,
} from '../../shared/job-from-url.js';
import { getJob, updateJob } from '../../data/jobs.js';
import { PATHS } from '../../shared/config.js';
import type { Job } from '../../shared/types.js';

const __filename = fileURLToPath(import.meta.url);

export interface RunJobScraperOptions {
  cacheDir?: string;
  headless?: boolean;
  useAuth?: boolean;
  maxAgeMs?: number;
  forceScrape?: boolean;
}

export interface RunJobScraperResult {
  job: Job & { url?: string };
  jobsFilePath: string;
  fromStore?: boolean;
  htmlPath?: string | null;
}

export async function runJobScraper(jobUrl: string, options: RunJobScraperOptions = {}): Promise<RunJobScraperResult> {
  const cacheDir = options.cacheDir ?? PATHS.jobCache;
  const jobId = getJobIdFromUrl(jobUrl);
  const site = getJobSiteFromUrl(jobUrl);
  const forceScrape = options.forceScrape ?? (process.env.FORCE_SCRAPE === '1' || process.env.FORCE_SCRAPE === 'true');

  if (jobId && site && !forceScrape) {
    const stored = getJob(site, jobId);
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
    const payload: Partial<Job> = {
      title: job.title,
      company: job.company,
      description: job.description,
      url: job.url,
      jobId: job.jobId ?? jobId,
      applyType: job.applyType,
      applicationSubmitted: job.applicationSubmitted,
    };
    if (job.appliedAt != null) payload.appliedAt = job.appliedAt;
    if (job.jobClosed != null) payload.jobClosed = job.jobClosed;
    updateJob(site, jobId, payload);
  }

  return {
    job: { ...job, jobId: job.jobId ?? jobId ?? undefined, site },
    jobsFilePath: PATHS.jobsFile,
    fromStore: false,
    htmlPath: existsSync(htmlPath) ? htmlPath : null,
  };
}

export interface GetApplicationStatusOptions {
  fromStoreOnly?: boolean;
}

export async function getApplicationStatus(
  jobUrl: string,
  options: GetApplicationStatusOptions = {}
): Promise<{ applicationSubmitted: boolean; appliedAt?: string; fromStore?: boolean }> {
  const jobId = getJobIdFromUrl(jobUrl);
  const site = getJobSiteFromUrl(jobUrl);

  if (jobId && site) {
    const stored = getJob(site, jobId);
    if (stored) {
      return {
        applicationSubmitted: !!stored.applicationSubmitted,
        ...(stored.appliedAt != null && { appliedAt: stored.appliedAt ?? undefined }),
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

function getJobUrl(): string | null {
  const env = process.env.JOB_URL;
  const argv = process.argv.slice(2);
  const forceIdx = argv.findIndex((a) => a === '--force' || a === '-f');
  if (forceIdx !== -1) argv.splice(forceIdx, 1);
  const statusIdx = argv.findIndex((a) => a === '--status' || a === '-s');
  if (statusIdx !== -1) argv.splice(statusIdx, 1);
  const raw = env || argv[0] || null;
  return raw ? toHandshakeJobDetailsUrl(raw) : null;
}

function getForceScrape(): boolean {
  if (process.env.FORCE_SCRAPE === '1' || process.env.FORCE_SCRAPE === 'true') return true;
  return process.argv.includes('--force') || process.argv.includes('-f');
}

function isStatusOnly(): boolean {
  return process.argv.includes('--status') || process.argv.includes('-s');
}

if (process.argv[1] === __filename) {
  const jobUrl = getJobUrl();
  if (!jobUrl) {
    console.error('Usage: node agents/job_scraper_agent/index.ts [--force] <job-url>');
    console.error('       node agents/job_scraper_agent/index.ts --status <job-url>   # application status only');
    console.error('   or: JOB_URL=<url> node agents/job_scraper_agent/index.ts');
    console.error('   or: FORCE_SCRAPE=1 node agents/job_scraper_agent/index.ts <job-url>');
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
