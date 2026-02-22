/**
 * Resume generator agent: Profile + Job → (assistant or mapping) → JSON only.
 * PDF is created only when needed (apply or export) via ensureResumePdfFromJsonFile.
 */
import 'dotenv/config';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { getProfile } from '../../data/profile.js';
import { setUserJobState, toJobRef } from '../../data/user-job-state.js';
import { loadJob } from '../../shared/job.js';
import { getPathsForUser, resolveUserId } from '../../shared/config.js';
import { resumeBasename } from '../../shared/filename-slugs.js';
import { profileToJsonResume } from '../../shared/json-resume.js';
import { generateResumeWithAssistant } from './assistant.js';
import { fileURLToPath } from 'url';
import type { Profile, Job } from '../../shared/types.js';

const __filename = fileURLToPath(import.meta.url);

export interface RunResumeGeneratorOptions {
  profile?: Profile;
  job?: Job;
  profilePath?: string;
  jobPath?: string;
  outputDir?: string;
  userId?: string;
  theme?: string;
  useAssistant?: boolean;
  assistantApiKey?: string;
  assistantModel?: string;
  forceRegenerate?: boolean;
}

export async function runResumeGenerator(options: RunResumeGeneratorOptions = {}): Promise<{
  jsonPath: string;
  resumePath: string | null;
}> {
  const userId = options.userId ?? 'default';
  const profile = options.profile ?? getProfile(userId);
  const job = options.job ?? loadJob(options.jobPath);
  const outDir = options.outputDir ?? getPathsForUser(userId).resumesDir;
  const basename = resumeBasename(profile, job || {});

  const existingJson = join(outDir, `${basename}.json`);
  if (basename && existsSync(existingJson) && !options.forceRegenerate) {
    console.log('Resume JSON already exists for this job, skipping generation:', existingJson);
    return { jsonPath: existingJson, resumePath: null };
  }

  const useAssistant =
    options.useAssistant ?? (process.env.USE_RESUME_ASSISTANT === '1' || process.env.USE_RESUME_ASSISTANT === 'true');

  let resumeJson: Record<string, unknown>;
  if (useAssistant) {
    resumeJson = await generateResumeWithAssistant({
      profile,
      job: (job || {}) as Job,
      apiKey: options.assistantApiKey,
      model: options.assistantModel,
    });
  } else {
    resumeJson = profileToJsonResume(profile, (job || {}) as Job) as Record<string, unknown>;
  }

  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, `${basename}.json`);
  writeFileSync(jsonPath, JSON.stringify(resumeJson, null, 2), 'utf8');
  if (job?.site && job?.jobId) {
    setUserJobState(userId, toJobRef(job.site, job.jobId), { resumeBasename: basename });
  }
  return { jsonPath, resumePath: null };
}

if (process.argv[1] === __filename) {
  const userId = resolveUserId({ envUserId: process.env.USER_ID, argv: process.argv });
  runResumeGenerator({ userId })
    .then((result) => {
      console.log('Generated:', result.jsonPath, result.resumePath ?? '(PDF not generated; run apply or export to create)');
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
