/**
 * List jobs enriched with application state and resume presence for UI/CLI.
 */
import { existsSync } from 'fs';
import { listJobs } from '../data/jobs.js';
import { getApplicationState } from '../data/apply-state.js';
import { getResumePathsForJob } from '../data/resumes.js';
import { normalizeUrl, toHandshakeJobDetailsUrl } from '../shared/job-from-url.js';
import type { Job } from '../shared/types.js';
import type { ApplicationState } from '../shared/types.js';

const HANDSHAKE_JOBS_BASE = process.env.HANDSHAKE_JOBS_BASE_URL || 'https://wmich.joinhandshake.com';

function jobUrlFor(site: string, jobId: string, job: Job): string | null {
  if (job?.url) {
    return site === 'handshake' ? toHandshakeJobDetailsUrl(job.url) : normalizeUrl(job.url);
  }
  if (site === 'handshake' && jobId) {
    const base = HANDSHAKE_JOBS_BASE.replace(/\/$/, '');
    return `${base}/jobs/${jobId}`;
  }
  return null;
}

export interface JobWithStatus {
  job: Job & { jobId: string; site: string };
  jobUrl: string | null;
  applicationState: ApplicationState | null;
  hasResume: boolean;
  appliedAt?: string;
}

export function listJobsWithStatus(): JobWithStatus[] {
  const data = listJobs();
  const result: JobWithStatus[] = [];
  for (const [site, jobs] of Object.entries(data)) {
    if (!jobs || typeof jobs !== 'object') continue;
    for (const [jobId, job] of Object.entries(jobs)) {
      const j = job as Job;
      const jobUrl = jobUrlFor(site, jobId, j);
      const applicationState = jobUrl ? getApplicationState(jobUrl) : null;
      const { jsonPath, pdfPath } = getResumePathsForJob(site, jobId);
      const hasResume = !!(jsonPath && existsSync(jsonPath)) || !!(pdfPath && existsSync(pdfPath));
      const appliedAt = j?.appliedAt ?? applicationState?.submittedAt ?? null;
      result.push({
        job: { ...j, jobId, site },
        jobUrl,
        applicationState,
        hasResume,
        ...(appliedAt && { appliedAt }),
      });
    }
  }
  return result;
}
