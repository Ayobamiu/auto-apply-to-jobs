/**
 * Resume generator agent: Profile + Job → (assistant or mapping) → JSON → PDF.
 * - Content: either Resume assistant (LLM) or profileToJsonResume (mapping). Assistant is separate for future conversational editing.
 * - Export: JSON → file + PDF via exportResumeToPdf (separate so we can re-export after edits).
 * Output: { jsonPath, resumePath } (resumePath = PDF).
 */
import 'dotenv/config';
import { loadProfile } from '../../shared/profile.js';
import { loadJob } from '../../shared/job.js';
import { PATHS } from '../../shared/config.js';
import { resumeBasename } from '../../shared/filename-slugs.js';
import { profileToJsonResume } from '../../shared/json-resume.js';
import { generateResumeWithAssistant } from './assistant.js';
import { exportResumeToPdf } from './export-pdf.js';
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
 * @returns {Promise<{ jsonPath: string, resumePath: string }>}
 */
export async function runResumeGenerator(options = {}) {
  const profile = options.profile ?? loadProfile(options.profilePath);
  const job = options.job ?? loadJob(options.jobPath);
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

  const basename = resumeBasename(profile, job || {});

  return exportResumeToPdf(resumeJson, {
    outputDir: options.outputDir ?? PATHS.output,
    resumeBasename: basename,
    theme: options.theme,
  });
}

if (process.argv[1] === __filename) {
  runResumeGenerator()
    .then((result) => {
      console.log('Generated:', result.jsonPath, result.resumePath);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
