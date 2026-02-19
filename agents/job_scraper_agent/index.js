/**
 * Job scraper agent: fetch a Handshake job by URL, scrape title/company/description, save JSON + HTML to job-cache.
 * Use SCRAPE_HEADED=1 for a visible browser (avoids bot-protection on some Handshake instances).
 *
 * Usage:
 *   node agents/job_scraper_agent/index.js <job-url>
 *   JOB_URL=<url> node agents/job_scraper_agent/index.js
 *
 * Returns: { job, jsonPath, htmlPath } (paths may be null if cache dir not used).
 */
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
import { getJobFromUrl, cacheKey } from '../../shared/job-from-url.js';
import { PATHS } from '../../shared/config.js';

/**
 * @param {string} jobUrl - Handshake job URL (e.g. job-search/12345?...)
 * @param {{ cacheDir?: string, headless?: boolean, useAuth?: boolean, maxAgeMs?: number }} [options]
 * @returns {Promise<{ job: { title: string, company: string, description: string, url?: string }, jsonPath: string | null, htmlPath: string | null }>}
 */
export async function runJobScraper(jobUrl, options = {}) {
  const cacheDir = options.cacheDir ?? PATHS.jobCache;
  const key = cacheKey(jobUrl);
  const jsonPath = join(cacheDir, `${key}.json`);
  const htmlPath = join(cacheDir, `${key}.html`);

  const job = await getJobFromUrl(jobUrl, {
    cacheDir: options.cacheDir,
    headless: options.headless,
    useAuth: options.useAuth,
    maxAgeMs: options.maxAgeMs,
  });

  return {
    job,
    jsonPath: existsSync(jsonPath) ? jsonPath : null,
    htmlPath: existsSync(htmlPath) ? htmlPath : null,
  };
}

function getJobUrl() {
  const env = process.env.JOB_URL;
  if (env) return env;
  const arg = process.argv[2];
  if (arg) return arg;
  return null;
}

if (process.argv[1] === __filename) {
  const jobUrl = getJobUrl();
  if (!jobUrl) {
    console.error('Usage: node agents/job_scraper_agent/index.js <job-url>');
    console.error('   or: JOB_URL=<url> node agents/job_scraper_agent/index.js');
    process.exit(1);
  }

  runJobScraper(jobUrl)
    .then(({ job, jsonPath, htmlPath }) => {
      console.log('Job:', job?.title || job?.company || jobUrl);
      console.log('Description length:', job?.description?.length ?? 0);
      if (jsonPath) console.log('JSON:', jsonPath);
      if (htmlPath) console.log('HTML:', htmlPath);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
