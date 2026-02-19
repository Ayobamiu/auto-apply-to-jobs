/**
 * Pipeline: get job (from URL scrape/cache or file), generate resume, then run Handshake apply when JOB_URL provided.
 * Usage: node orchestration/run-pipeline.js [job-url]
 * If job-url is omitted, only resume is generated from shared/job.json. Env JOB_URL can be used instead.
 */
import { runResumeGenerator } from '../agents/resume_generator_agent/index.js';
import { runJobScraper } from '../agents/job_scraper_agent/index.js';
import { loadJob } from '../shared/job.js';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function getJobUrl() {
  const env = process.env.JOB_URL;
  if (env) return env;
  const arg = process.argv[2];
  if (arg) return arg;
  return null;
}

async function main() {
  const jobUrl = getJobUrl();
  let job;
  if (jobUrl) {
    console.log('Step 0: Get job from URL (scrape or cache)...');
    const { job: scrapedJob } = await runJobScraper(jobUrl);
    job = scrapedJob;
    console.log('Job:', job.title || job.company || jobUrl);
  } else {
    job = loadJob();
  }

  console.log('Step 1: Generate resume from profile + job...');
  const { resumePath } = await runResumeGenerator({ job });
  console.log('Resume:', resumePath);

  if (!jobUrl) {
    console.log('No JOB_URL. Run handshake:apply with the job URL when ready.');
    return;
  }

  console.log('Step 2: Run Handshake apply...');
  const child = spawn(
    'node',
    [join(ROOT, 'agents/auto_apply_agent/handshake-apply-real.js'), jobUrl],
    {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, RESUME_PATH: resumePath },
    }
  );
  child.on('exit', (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
