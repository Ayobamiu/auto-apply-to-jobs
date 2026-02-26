/**
 * List jobs enriched with application state and resume presence for UI/CLI.
 */
import { listJobs } from '../data/jobs.js';
import { getApplicationState } from '../data/apply-state.js';
import { getResumeForJob } from '../data/job-artifacts.js';
import { getUserJobState, toJobRef } from '../data/user-job-state.js';
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

export async function listJobsWithStatus(userId?: string): Promise<JobWithStatus[]> {
  const uid = userId ?? 'default';
  const data = await listJobs();
  const result: JobWithStatus[] = [];
  for (const [site, jobs] of Object.entries(data)) {
    if (!jobs || typeof jobs !== 'object') continue;
    for (const [jobId, job] of Object.entries(jobs)) {
      const j = job as Job;
      const jobUrl = jobUrlFor(site, jobId, j);
      const applicationState = jobUrl ? await getApplicationState(jobUrl, uid) : null;
      const resume = await getResumeForJob(uid, site, jobId);
      const hasResume = !!resume;
      const userState = await getUserJobState(uid, toJobRef(site, jobId));
      const appliedAt: string | undefined = userState?.appliedAt ?? applicationState?.submittedAt ?? undefined;
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
