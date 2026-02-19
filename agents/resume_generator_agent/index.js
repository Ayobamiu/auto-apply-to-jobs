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
import { profileToJsonResume } from '../../shared/json-resume.js';
import { generateResumeWithAssistant } from './assistant.js';
import { exportResumeToPdf } from './export-pdf.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

function slug(str) {
  return (str || 'job').replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '').toLowerCase().slice(0, 40);
}

/** If job has a URL with /jobs/12345, return "job-12345" for use as slug when title/company are missing or hostname-like. */
function jobSlugFromUrl(job) {
  const u = job?.url;
  if (!u || typeof u !== 'string') return null;
  const m = u.match(/\/jobs\/(\d+)/);
  return m ? `job-${m[1]}` : null;
}

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
  const primarySlug = slug(job?.title || job?.company || '');
  const looksLikeDomain = /joinhandshake|\.com|\.edu$/i.test(primarySlug) || primarySlug.length < 2;
  const jobSlug = looksLikeDomain ? (jobSlugFromUrl(job) || primarySlug || 'job') : (primarySlug || 'job');
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

  return exportResumeToPdf(resumeJson, {
    outputDir: options.outputDir ?? PATHS.output,
    jobSlug,
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
