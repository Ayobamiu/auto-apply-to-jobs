/**
 * CLI to edit a resume for a job by natural-language message.
 */
import 'dotenv/config';
import { updateResumeForJob } from './resume-edit.js';
import { isAppError } from '../../shared/errors.js';

function getArgs(): { site: string | undefined; jobId: string | undefined; message: string | undefined } {
  const site = process.env.SITE || process.argv[2];
  const jobId = process.env.JOB_ID || process.argv[3];
  const message = process.env.MESSAGE || process.argv[4];
  return { site, jobId, message };
}

async function main(): Promise<void> {
  const { site, jobId, message } = getArgs();
  if (!site || !jobId || !message) {
    console.error('Usage: npm run resume:edit -- <site> <jobId> "Edit message"');
    console.error('   or: SITE=handshake JOB_ID=10764179 MESSAGE="Add Django" npm run resume:edit');
    process.exit(1);
  }

  await updateResumeForJob(site, jobId, message);
  console.log('Resume updated. Re-run pipeline or export PDF if needed.');
}

main().catch((err) => {
  if (isAppError(err)) {
    console.error(err.message);
  } else {
    console.error(err);
  }
  process.exit(1);
});
