/**
 * Pipeline: get job (from URL scrape/cache or file), generate resume, then run Handshake apply when JOB_URL provided.
 * Usage: node orchestration/run-pipeline.js [job-url]
 * If job-url is omitted, only resume is generated from shared/job.json. Env JOB_URL can be used instead.
 * Loads .env so SCRAPE_HEADED, OPENAI_API_KEY, etc. work from one file.
 */
import 'dotenv/config';
import { basename } from 'path';
import { runResumeGenerator } from '../agents/resume_generator_agent/index.js';
import { ensureResumePdfFromJsonFile } from '../agents/resume_generator_agent/export-pdf.js';
import { runJobScraper } from '../agents/job_scraper_agent/index.js';
import { loadJob } from '../shared/job.js';
import { toHandshakeJobDetailsUrl, getJobIdFromUrl, getJobSiteFromUrl } from '../shared/job-from-url.js';
import { updateJob } from '../data/jobs.js';
import { PATHS } from '../shared/config.js';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { isAppError } from '../shared/errors.js';
import { preflightForPipeline } from '../shared/preflight.js';
import { runHandshakeApply } from '../agents/auto_apply_agent/handshake-apply-real.js';
import { getApplicationStatus } from '../agents/job_scraper_agent/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getJobUrl() {
  const raw = process.env.JOB_URL || process.argv[2] || null;
  return raw ? toHandshakeJobDetailsUrl(raw) : null;
}

/**
 * Run full pipeline for a job: scrape, generate resume, optionally apply. Callable API (no spawn).
 * @param {string | null} jobUrl - Handshake job URL (or null for resume-only from shared/job.json)
 * @param {{ submit?: boolean, forceScrape?: boolean }} [options]
 * @returns {Promise<{ job: object, jsonPath?: string, resumePath?: string, applied?: boolean }>}
 */
export async function runPipelineForJob(jobUrl, options = {}) {
  preflightForPipeline(jobUrl ?? undefined);

  let job;
  if (jobUrl) {
    console.log('Step 0: Get job from URL (scrape or cache)...');
    const { job: scrapedJob } = await runJobScraper(jobUrl, { forceScrape: options.forceScrape });
    job = scrapedJob;
    console.log('Job:', job.title || job.company || jobUrl);
  } else {
    job = loadJob();
  }

  console.log('Step 1: Generate resume from profile + job...');
  const { jsonPath, resumePath: generatedPdfPath } = await runResumeGenerator({ job });
  let resumePath = generatedPdfPath;
  if (!resumePath && jsonPath) {
    const { resumePath: ensured } = ensureResumePdfFromJsonFile(jsonPath, { outputDir: PATHS.resumes });
    resumePath = ensured;
  }
  console.log('Resume:', resumePath ?? jsonPath);

  if (jobUrl) {
    const site = getJobSiteFromUrl(jobUrl);
    const jobId = getJobIdFromUrl(jobUrl);
    if (site && jobId && jsonPath) {
      const resumeBasename = basename(jsonPath, '.json');
      updateJob(site, jobId, { ...job, resumeBasename });
    }
  }

  if (!jobUrl) {
    console.log('No JOB_URL. Run handshake:apply with the job URL when ready.');
    return { job, jsonPath, resumePath };
  }

  const { applicationSubmitted } = await getApplicationStatus(jobUrl, { fromStoreOnly: true });
  if (applicationSubmitted) {
    console.log('Already applied to this job. Skipping apply step.');
    return { job, jsonPath, resumePath, applied: true, skipped: true };
  }

  console.log('Step 2: Run Handshake apply...');
  const applyResult = await runHandshakeApply(jobUrl, {
    submit: options.submit ?? (process.env.SUBMIT_APPLICATION === '1' || process.env.SUBMIT_APPLICATION === 'true'),
    resumePath,
  });
  return {
    job,
    jsonPath,
    resumePath,
    applied: applyResult.applied || applyResult.skipped,
  };
}

async function main() {
  const jobUrl = getJobUrl();
  await runPipelineForJob(jobUrl, {
    submit: process.env.SUBMIT_APPLICATION === '1' || process.env.SUBMIT_APPLICATION === 'true',
    forceScrape: process.env.FORCE_SCRAPE === '1' || process.env.FORCE_SCRAPE === 'true',
  });
}

main().then(() => process.exit(0)).catch((err) => {
  if (isAppError(err)) {
    console.error(err.message);
  } else {
    console.error(err);
  }
  process.exit(1);
});
