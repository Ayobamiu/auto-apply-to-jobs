/**
 * JSON Resume → file + PDF. Separate from content generation so we can re-export after edits.
 */
import { mkdirSync, writeFileSync, readFileSync, statSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname, basename as pathBasename } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { PATHS, ROOT } from '../../shared/config.js';
import { getResumeForJob } from '../../data/job-artifacts.js';
import { getProfile } from '../../data/profile.js';
import { getJob } from '../../data/jobs.js';
import { resumeBasename } from '../../shared/filename-slugs.js';
import { AppError, CODES } from '../../shared/errors.js';

const DEFAULT_THEME = 'jsonresume-theme-even';

export type { ExportResumeOptions, EnsureResumePdfFromDbOptions } from '../../shared/types.js';
import type { ExportResumeOptions, EnsureResumePdfFromDbOptions } from '../../shared/types.js';

export function exportResumeToPdf(
  resumeJson: Record<string, unknown>,
  options: ExportResumeOptions = {}
): { jsonPath: string; resumePath: string } {
  const outDir = options.outputDir ?? PATHS.resumes;
  const jobSlug = options.jobSlug ?? 'resume';
  const basename = options.resumeBasename ?? `resume-${jobSlug}`;
  const theme = options.theme ?? DEFAULT_THEME;

  try {
    mkdirSync(outDir, { recursive: true });
  } catch (_) {}

  const jsonPath = join(outDir, `${basename}.json`);
  const pdfPath = join(outDir, `${basename}.pdf`);

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

export function ensureResumePdfFromJsonFile(
  jsonPath: string,
  options: { outputDir?: string; theme?: string } = {}
): { jsonPath: string; resumePath: string } {
  const outDir = options.outputDir ?? dirname(jsonPath);
  const theme = options.theme ?? DEFAULT_THEME;
  const base = pathBasename(jsonPath, '.json');
  const pdfPath = join(outDir, `${base}.pdf`);
  try {
    const jsonStat = statSync(jsonPath);
    const pdfStat = statSync(pdfPath);
    if (pdfStat.mtimeMs >= jsonStat.mtimeMs) {
      return { jsonPath, resumePath: pdfPath };
    }
  } catch (_) {}
  const raw = readFileSync(jsonPath, 'utf8');
  const resumeJson = JSON.parse(raw) as Record<string, unknown>;
  return exportResumeToPdf(resumeJson, { outputDir: outDir, resumeBasename: base, theme });
}


/**
 * Load resume JSON from job_artifacts, generate PDF on demand. Throws if no resume in DB.
 */
export async function ensureResumePdfFromDb(
  userId: string,
  site: string,
  jobId: string,
  options: EnsureResumePdfFromDbOptions = {}
): Promise<{ resumePath: string }> {
  const resumeJson = await getResumeForJob(userId, site, jobId);
  if (!resumeJson) {
    throw new AppError(CODES.NO_RESUME);
  }
  const profile = options.profile ?? (await getProfile(userId));
  const job = options.job ?? (await getJob(site, jobId));
  const base = resumeBasename(profile, job) || 'resume';
  const outDir = options.outputDir ?? join(PATHS.output, 'resumes', userId.replace(/[^a-zA-Z0-9_-]/g, '_'));
  mkdirSync(outDir, { recursive: true });
  const pdfPath = join(outDir, `${base}.pdf`);

  const tempDir = tmpdir();
  const tempJsonPath = join(tempDir, `auto-apply-${randomUUID()}.json`);
  try {
    writeFileSync(tempJsonPath, JSON.stringify(resumeJson, null, 2), 'utf8');
    const theme = options.theme ?? DEFAULT_THEME;
    execSync(`npx resumed export "${tempJsonPath}" -o "${pdfPath}" -t ${theme}`, {
      cwd: ROOT,
      stdio: 'inherit',
    });
    return { resumePath: pdfPath };
  } finally {
    try {
      unlinkSync(tempJsonPath);
    } catch (_) {}
  }
}
