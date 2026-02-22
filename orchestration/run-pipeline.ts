/**
 * Pipeline: get job (from URL scrape/cache or file), generate resume, then run Handshake apply when JOB_URL provided.
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
import { dirname } from 'path';
import { isAppError } from '../shared/errors.js';
import { preflightForPipeline } from '../shared/preflight.js';
import { runHandshakeApply } from '../agents/auto_apply_agent/handshake-apply-real.js';
import { getApplicationStatus } from '../agents/job_scraper_agent/index.js';
import { startPhase, startTotal, isTimingEnabled } from '../shared/timing.js';
import type { Job } from '../shared/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getJobUrl(): string | null {
  const raw = process.env.JOB_URL || process.argv[2] || null;
  return raw ? toHandshakeJobDetailsUrl(raw as string) : null;
}

export interface RunPipelineForJobOptions {
  submit?: boolean;
  forceScrape?: boolean;
}

export interface RunPipelineForJobResult {
  job: Job;
  jsonPath?: string;
  resumePath?: string;
  applied?: boolean;
  skipped?: boolean;
}

export async function runPipelineForJob(
  jobUrl: string | null,
  options: RunPipelineForJobOptions = {}
): Promise<RunPipelineForJobResult> {
  if (isTimingEnabled()) console.log('[timing] Phase breakdown:');
  const endTotal = startTotal('pipeline');
  const endPreflight = startPhase('Preflight');
  preflightForPipeline(jobUrl ?? undefined);
  endPreflight();

  let job: Job;
  if (jobUrl) {
    console.log('Step 0: Get job from URL (scrape or cache)...');
    const endStep0 = startPhase('Step 0: Get job (scrape or cache)');
    const { job: scrapedJob } = await runJobScraper(jobUrl, { forceScrape: options.forceScrape });
    job = scrapedJob;
    endStep0();
    console.log('Job:', job.title || job.company || jobUrl);
  } else {
    const endLoad = startPhase('Load job from file');
    job = loadJob();
    endLoad();
  }

  console.log('Step 1: Generate resume from profile + job...');
  const endStep1 = startPhase('Step 1: Generate resume');
  const { jsonPath, resumePath: generatedPdfPath } = await runResumeGenerator({ job });
  let resumePath = generatedPdfPath;
  if (!resumePath && jsonPath) {
    const endPdf = startPhase('Step 1b: Ensure PDF from JSON');
    const { resumePath: ensured } = ensureResumePdfFromJsonFile(jsonPath, { outputDir: PATHS.resumes });
    resumePath = ensured;
    endPdf();
  }
  endStep1();
  console.log('Resume:', resumePath ?? jsonPath);

  if (jobUrl) {
    const site = getJobSiteFromUrl(jobUrl);
    const jobId = getJobIdFromUrl(jobUrl) ?? undefined;
    if (site && jobId && jsonPath) {
      const resumeBasename = basename(jsonPath, '.json');
      updateJob(site, jobId, { ...job, resumeBasename });
    }
  }

  if (!jobUrl) {
    console.log('No JOB_URL. Run handshake:apply with the job URL when ready.');
    endTotal();
    return { job, jsonPath, resumePath: resumePath ?? undefined };
  }

  const endAlreadyApplied = startPhase('Check already applied (store)');
  const { applicationSubmitted } = await getApplicationStatus(jobUrl, { fromStoreOnly: true });
  endAlreadyApplied();
  if (applicationSubmitted) {
    console.log('Already applied to this job. Skipping apply step.');
    endTotal();
    return { job, jsonPath, resumePath: resumePath ?? undefined, applied: true, skipped: true };
  }

  console.log('Step 2: Run Handshake apply...');
  const endApply = startPhase('Step 2: Handshake apply (browser + upload + submit)');
  const applyResult = await runHandshakeApply(jobUrl, {
    submit: options.submit ?? (process.env.SUBMIT_APPLICATION === '1' || process.env.SUBMIT_APPLICATION === 'true'),
    resumePath: resumePath ?? undefined,
  });
  endApply();
  endTotal();
  return {
    job,
    jsonPath,
    resumePath: resumePath ?? undefined,
    applied: applyResult.applied || applyResult.skipped,
  };
}

async function main(): Promise<void> {
  const jobUrl = getJobUrl();
  await runPipelineForJob(jobUrl, {
    submit: process.env.SUBMIT_APPLICATION === '1' || process.env.SUBMIT_APPLICATION === 'true',
    forceScrape: process.env.FORCE_SCRAPE === '1' || process.env.FORCE_SCRAPE === 'true',
  });
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    if (isAppError(err)) {
      console.error(err.message);
    } else {
      console.error(err);
    }
    process.exit(1);
  });
