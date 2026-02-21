/**
 * Resume generator agent: Profile + Job → (assistant or mapping) → JSON only.
 * PDF is created only when needed (apply or export) via ensureResumePdfFromJsonFile.
 */
import 'dotenv/config';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { getProfile } from '../../data/profile.js';
import { loadJob } from '../../shared/job.js';
import { PATHS } from '../../shared/config.js';
import { resumeBasename } from '../../shared/filename-slugs.js';
import { profileToJsonResume } from '../../shared/json-resume.js';
import { generateResumeWithAssistant } from './assistant.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

/**
 * @param {object} [options]
 * @param {object} [options.profile] - Override profile (else load from profilePath)
 * @param {object} [options.job] - Override job (else load from jobPath)
 * @param {string} [options.profilePath]
 * @param {string} [options.jobPath]
 * @param {string} [options.outputDir]
 * @param {string} [options.theme]
 * @param {boolean} [options.useAssistant] - Use LLM assistant (default: process.env.USE_RESUME_ASSISTANT === '1' or 'true')
 * @param {string} [options.assistantApiKey]
 * @param {string} [options.assistantModel]
 * @param {boolean} [options.forceRegenerate] - If true, regenerate even when JSON exists
 * @returns {Promise<{ jsonPath: string, resumePath: string | null }>}
 */
export async function runResumeGenerator(options = {}) {
  const profile = options.profile ?? getProfile();
  const job = options.job ?? loadJob(options.jobPath);
  const outDir = options.outputDir ?? PATHS.resumes;
  const basename = resumeBasename(profile, job || {});

  const existingJson = join(outDir, `${basename}.json`);
  if (basename && existsSync(existingJson) && !options.forceRegenerate) {
    console.log('Resume JSON already exists for this job, skipping generation:', existingJson);
    return { jsonPath: existingJson, resumePath: null };
  }

  const useAssistant = options.useAssistant ?? (process.env.USE_RESUME_ASSISTANT === '1' || process.env.USE_RESUME_ASSISTANT === 'true');

  let resumeJson;
  if (useAssistant) {
    resumeJson = await generateResumeWithAssistant({
      profile,
      job: job || {},
      apiKey: options.assistantApiKey,
      model: options.assistantModel,
    });
  } else {
    resumeJson = profileToJsonResume(profile, job || {});
  }

  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, `${basename}.json`);
  writeFileSync(jsonPath, JSON.stringify(resumeJson, null, 2), 'utf8');
  return { jsonPath, resumePath: null };
}

if (process.argv[1] === __filename) {
  runResumeGenerator()
    .then((result) => {
      console.log('Generated:', result.jsonPath, result.resumePath ?? '(PDF not generated; run apply or export to create)');
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
