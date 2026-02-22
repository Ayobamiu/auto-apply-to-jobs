/**
 * List jobs enriched with application state and resume presence for UI/CLI.
 */
import { existsSync } from 'fs';
import { listJobs } from '../data/jobs.js';
import { getApplicationState } from '../data/apply-state.js';
import { getResumePathsForJob } from '../data/resumes.js';
import { normalizeUrl, toHandshakeJobDetailsUrl } from '../shared/job-from-url.js';

const HANDSHAKE_JOBS_BASE = process.env.HANDSHAKE_JOBS_BASE_URL || 'https://wmich.joinhandshake.com';

function jobUrlFor(site, jobId, job) {
  if (job?.url) {
    return site === 'handshake' ? toHandshakeJobDetailsUrl(job.url) : normalizeUrl(job.url);
  }
  if (site === 'handshake' && jobId) {
    const base = HANDSHAKE_JOBS_BASE.replace(/\/$/, '');
    return `${base}/jobs/${jobId}`;
  }
  return null;
}

/**
 * @returns {Array<{ job: object, jobUrl: string | null, applicationState: object | null, hasResume: boolean, appliedAt?: string }>}
 */
export function listJobsWithStatus() {
  const data = listJobs();
  const result = [];
  for (const [site, jobs] of Object.entries(data)) {
    if (!jobs || typeof jobs !== 'object') continue;
    for (const [jobId, job] of Object.entries(jobs)) {
      const jobUrl = jobUrlFor(site, jobId, job);
      const applicationState = jobUrl ? getApplicationState(jobUrl) : null;
      const { jsonPath, pdfPath } = getResumePathsForJob(site, jobId);
      const hasResume = !!(jsonPath && existsSync(jsonPath)) || !!(pdfPath && existsSync(pdfPath));
      const appliedAt = job?.appliedAt ?? applicationState?.submittedAt ?? null;
      result.push({
        job: { ...job, jobId, site },
        jobUrl,
        applicationState,
        hasResume,
        ...(appliedAt && { appliedAt }),
      });
    }
  }
  return result;
}
