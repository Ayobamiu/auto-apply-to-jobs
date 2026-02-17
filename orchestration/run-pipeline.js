/**
 * Pipeline: generate resume from profile + job, then run Handshake apply (when JOB_URL provided).
 * Usage: node orchestration/run-pipeline.js [job-url]
 * If job-url is omitted, only resume is generated. Env JOB_URL can be used instead.
 */
import { runResumeGenerator } from '../agents/resume_generator_agent/index.js';
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
  console.log('Step 1: Generate resume from profile + job...');
  const job = loadJob();
  const { resumePath } = runResumeGenerator({ job });
  console.log('Resume:', resumePath);

  const jobUrl = getJobUrl();
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
      env: { ...process.env /* RESUME_PATH can be set when we output PDF */ },
    }
  );
  child.on('exit', (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
