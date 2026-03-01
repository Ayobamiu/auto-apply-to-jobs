/**
 * Resume generator agent: Profile + Job → (assistant or mapping) → JSON only.
 * Saves to job_artifacts DB. PDF created on demand via ensureResumePdfFromDb.
 */
import 'dotenv/config';
import { getProfile } from '../../data/profile.js';
import { getBaseResume } from '../../data/user-resumes.js';
import { setUserJobState, toJobRef } from '../../data/user-job-state.js';
import { getResumeForJob, saveResumeForJob } from '../../data/job-artifacts.js';
import { loadJob } from '../../shared/job.js';
import { getPathsForUser, resolveUserId } from '../../shared/config.js';
import { resumeBasename } from '../../shared/filename-slugs.js';
import { profileToJsonResume } from '../../shared/json-resume.js';
import { generateResumeWithAssistant } from './assistant.js';
import { fileURLToPath } from 'url';
import type { Profile, Job } from '../../shared/types.js';

const __filename = fileURLToPath(import.meta.url);

export type { RunResumeGeneratorOptions, RunResumeGeneratorResult } from '../../shared/types.js';
import type { RunResumeGeneratorOptions, RunResumeGeneratorResult } from '../../shared/types.js';

export async function runResumeGenerator(options: RunResumeGeneratorOptions = {}): Promise<RunResumeGeneratorResult> {
  const userId = options.userId ?? 'default';
  const profile = options.profile ?? (await getProfile(userId));
  const job = options.job ?? loadJob(options.jobPath);
  const basename = resumeBasename(profile, job || {});

  const site = job?.site;
  const jobId = job?.jobId;
  const jobRef = site && jobId ? toJobRef(site, jobId) : null;

  if (jobRef && !options.forceRegenerate) {
    const existing = await getResumeForJob(userId, site!, jobId!);
    if (existing) {
      console.log('Resume JSON already exists for this job, skipping generation.');
      return { jobRef, resumePath: null };
    }
  }

  const baseResumeJson =
    options.baseResumeJson ?? (userId ? await getBaseResume(userId) : null);

  const useAssistant =
    options.useAssistant ?? (process.env.USE_RESUME_ASSISTANT === '1' || process.env.USE_RESUME_ASSISTANT === 'true');

  let resumeJson: Record<string, unknown>;
  if (useAssistant) {
    resumeJson = await generateResumeWithAssistant({
      profile,
      baseResumeJson: baseResumeJson ?? undefined,
      job: (job || {}) as Job,
      apiKey: options.assistantApiKey,
      model: options.assistantModel,
    });
  } else {
    resumeJson = profileToJsonResume(profile, (job || {}) as Job) as Record<string, unknown>;
  }

  if (jobRef) {
    await saveResumeForJob(userId, site!, jobId!, resumeJson);
    if (job?.site && job?.jobId) {
      await setUserJobState(userId, jobRef, { resumeBasename: basename });
    }
  }
  return { jobRef, resumePath: null };
}

if (process.argv[1] === __filename) {
  const userId = resolveUserId({ envUserId: process.env.USER_ID, argv: process.argv });
  runResumeGenerator({ userId })
    .then((result) => {
      console.log('Generated:', result.jobRef ?? 'no job', result.resumePath ?? '(PDF on demand; run apply to create)');
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
