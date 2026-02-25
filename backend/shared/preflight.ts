/**
 * Preflight: validate "ready to run pipeline/apply" before scrape or browser.
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { PATHS } from './config.js';
import { getProfile } from '../data/profile.js';
import { getResumePathsForJob } from '../data/resumes.js';
import { getJobIdFromUrl, getJobSiteFromUrl, toHandshakeJobDetailsUrl } from './job-from-url.js';
import { AppError, CODES } from './errors.js';

function ensureJobUrl(url: string | undefined): string | null {
  return url ? toHandshakeJobDetailsUrl(url) : null;
}

async function checkProfile(errors: string[], userId?: string): Promise<void> {
  const profile = await getProfile(userId);
  if (!profile?.name?.trim()) errors.push('Profile name is required (data/profiles.json)');
  if (!profile?.email?.trim()) errors.push('Profile email is required (data/profiles.json)');
}

async function resumePathExistsForApply(jobUrl: string, userId?: string): Promise<boolean> {
  if (process.env.RESUME_PATH && existsSync(process.env.RESUME_PATH)) return true;
  const jobId = getJobIdFromUrl(jobUrl);
  const site = getJobSiteFromUrl(jobUrl);
  if (jobId && site) {
    const { jsonPath, pdfPath } = await getResumePathsForJob(site, jobId, userId);
    if (existsSync(pdfPath) || existsSync(jsonPath)) return true;
  }
  const fixture = join(PATHS.fixtures, 'sample-resume.pdf');
  return existsSync(fixture);
}

export async function preflightForApply(jobUrl: string | undefined, userId?: string): Promise<{ ok: true }> {
  const errors: string[] = [];
  const resolvedUrl = ensureJobUrl(jobUrl);
  if (!resolvedUrl) {
    errors.push('Job URL required (JOB_URL or argument)');
  } else {
    if (!(await resumePathExistsForApply(resolvedUrl, userId))) {
      errors.push('No resume file found (set RESUME_PATH, run pipeline for this job, or add data/resumes/ or fixtures/sample-resume.pdf)');
    }
  }
  if (errors.length) {
    throw new AppError(CODES.PREFLIGHT_FAILED, errors.join('; '));
  }
  return { ok: true };
}

export async function preflightForPipeline(jobUrl: string | undefined, userId?: string): Promise<{ ok: true }> {
  const errors: string[] = [];
  if (jobUrl) {
    const resolvedUrl = ensureJobUrl(jobUrl);
    if (!resolvedUrl) {
      errors.push('Job URL required (JOB_URL or argument)');
    } else {
      await checkProfile(errors, userId);
    }
  }
  if (errors.length) {
    throw new AppError(CODES.PREFLIGHT_FAILED, errors.join('; '));
  }
  return { ok: true };
}
