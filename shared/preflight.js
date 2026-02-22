/**
 * Preflight: validate "ready to run pipeline/apply" before scrape or browser.
 * Single place that returns clear failures so CLI/UI can show them.
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { PATHS } from './config.js';
import { getProfile } from '../data/profile.js';
import { getJob } from '../data/jobs.js';
import { getResumePathsForJob } from '../data/resumes.js';
import { getJobIdFromUrl, getJobSiteFromUrl, toHandshakeJobDetailsUrl } from './job-from-url.js';
import { AppError, CODES } from './errors.js';

function ensureJobUrl(url) {
  return url ? toHandshakeJobDetailsUrl(url) : null;
}

function checkProfile(errors) {
  const profile = getProfile();
  if (!profile?.name?.trim()) errors.push('Profile name is required (data/profile.json)');
  if (!profile?.email?.trim()) errors.push('Profile email is required (data/profile.json)');
}

/**
 * Resolve whether we have a resume file for apply: RESUME_PATH env, job-specific path, or fixture.
 */
function resumePathExistsForApply(jobUrl) {
  if (process.env.RESUME_PATH && existsSync(process.env.RESUME_PATH)) return true;
  const jobId = getJobIdFromUrl(jobUrl);
  const site = getJobSiteFromUrl(jobUrl);
  if (jobId && site) {
    const { jsonPath, pdfPath } = getResumePathsForJob(site, jobId);
    if (existsSync(pdfPath) || existsSync(jsonPath)) return true;
  }
  const fixture = join(PATHS.fixtures, 'sample-resume.pdf');
  return existsSync(fixture);
}

/**
 * Preflight for apply flow: job URL, optional profile name/email, resume path or fixture must exist.
 * @param {string} [jobUrl] - Raw job URL (env or arg)
 * @throws {AppError} PREFLIGHT_FAILED with messages if validation fails
 */
export function preflightForApply(jobUrl) {
  const errors = [];
  const resolvedUrl = ensureJobUrl(jobUrl);
  if (!resolvedUrl) {
    errors.push('Job URL required (JOB_URL or argument)');
  } else {
    if (!resumePathExistsForApply(resolvedUrl)) {
      errors.push('No resume file found (set RESUME_PATH, run pipeline for this job, or add data/resumes/ or fixtures/sample-resume.pdf)');
    }
  }
  if (errors.length) {
    throw new AppError(CODES.PREFLIGHT_FAILED, errors.join('; '));
  }
  return { ok: true };
}

/**
 * Preflight for pipeline: when jobUrl is provided, ensure it's present and optional profile.
 * When no jobUrl, pipeline still runs (resume from shared/job.json only).
 * @param {string} [jobUrl] - Raw job URL (env or arg)
 * @throws {AppError} PREFLIGHT_FAILED with messages if validation fails
 */
export function preflightForPipeline(jobUrl) {
  const errors = [];
  if (jobUrl) {
    const resolvedUrl = ensureJobUrl(jobUrl);
    if (!resolvedUrl) {
      errors.push('Job URL required (JOB_URL or argument)');
    } else {
      checkProfile(errors);
    }
  }
  if (errors.length) {
    throw new AppError(CODES.PREFLIGHT_FAILED, errors.join('; '));
  }
  return { ok: true };
}
