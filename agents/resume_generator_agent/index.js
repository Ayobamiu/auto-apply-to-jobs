/**
 * Resume generator agent: Profile + Job → JSON Resume → PDF.
 * Uses JSON Resume schema; exports PDF via resumed + theme.
 * Output: { jsonPath, resumePath } (resumePath = PDF).
 */
import { mkdirSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { loadProfile } from '../../shared/profile.js';
import { loadJob } from '../../shared/job.js';
import { PATHS, ROOT } from '../../shared/config.js';
import { profileToJsonResume } from '../../shared/json-resume.js';

const __filename = fileURLToPath(import.meta.url);

function slug(str) {
  return (str || 'job').replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '').toLowerCase().slice(0, 40);
}

const DEFAULT_THEME = 'jsonresume-theme-even';

export function runResumeGenerator(options = {}) {
  const profile = options.profile ?? loadProfile(options.profilePath);
  const job = options.job ?? loadJob(options.jobPath);
  const outDir = options.outputDir ?? PATHS.output;
  const jobSlug = slug(job?.title || job?.company || 'job');
  const theme = options.theme ?? DEFAULT_THEME;

  try {
    mkdirSync(outDir, { recursive: true });
  } catch (_) { }

  const jsonPath = join(outDir, `resume-${jobSlug}.json`);
  const pdfPath = join(outDir, `resume-${jobSlug}.pdf`);

  const resumeJson = profileToJsonResume(profile, job || {});
  writeFileSync(jsonPath, JSON.stringify(resumeJson, null, 2), 'utf8');

  try {
    execSync(`npx resumed export "${jsonPath}" -o "${pdfPath}" -t ${theme}`, {
      cwd: ROOT,
      stdio: 'inherit',
    });
  } catch (err) {
    console.error('Resumed PDF export failed. Ensure dependencies are installed: npm install resumed jsonresume-theme-even puppeteer');
    throw err;
  }

  return { jsonPath, resumePath: pdfPath };
}

if (process.argv[1] === __filename) {
  const result = runResumeGenerator();
  console.log('Generated:', result.jsonPath, result.resumePath);
}
