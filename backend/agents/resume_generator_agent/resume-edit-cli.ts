/**
 * CLI to edit a resume for a job by natural-language message.
 */
import 'dotenv/config';
import { updateResumeForJob } from './resume-edit.js';
import { resolveUserId } from '../../shared/config.js';
import { isAppError } from '../../shared/errors.js';

function getArgs(): {
  site: string | undefined;
  jobId: string | undefined;
  message: string | undefined;
  userId: string;
} {
  let argv = process.argv.slice(2);
  const userIdx = argv.indexOf('--user');
  if (userIdx !== -1 && argv[userIdx + 1]) {
    argv = argv.slice(0, userIdx).concat(argv.slice(userIdx + 2));
  }
  const site = process.env.SITE || argv[0];
  const jobId = process.env.JOB_ID || argv[1];
  const message = process.env.MESSAGE || argv[2];
  const userId = resolveUserId({ envUserId: process.env.USER_ID, argv: process.argv });
  return { site, jobId, message, userId };
}

async function main(): Promise<void> {
  const { site, jobId, message, userId } = getArgs();
  if (!site || !jobId || !message) {
    console.error('Usage: npm run resume:edit -- [--user <id>] <site> <jobId> "Edit message"');
    console.error('   or: SITE=handshake JOB_ID=10764179 MESSAGE="Add Django" npm run resume:edit');
    process.exit(1);
  }

  await updateResumeForJob(site, jobId, message, { userId });
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
