/**
 * Job finder registry: single entry point for discovering jobs from Handshake or other sites.
 */
import { handshakeJobFinder } from './handshake.js';
import type { JobFinder, JobListing, FindJobsOptions } from '../shared/job-finder-types.js';

const finders: Record<string, JobFinder> = {
  handshake: handshakeJobFinder,
};

export function getJobFinder(site: string): JobFinder | null {
  return finders[site] ?? null;
}

export async function findJobs(
  userId: string,
  options: FindJobsOptions & { site?: string } = {}
): Promise<JobListing[]> {
  const { site, ...findOptions } = options;

  if (site) {
    const finder = getJobFinder(site);
    if (!finder) return [];
    return finder.findJobs(userId, findOptions);
  }

  const seen = new Set<string>();
  const merged: JobListing[] = [];
  for (const s of Object.keys(finders)) {
    const list = await finders[s].findJobs(userId, findOptions);
    for (const job of list) {
      const key = `${job.site}:${job.jobId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(job);
    }
  }
  return merged;
}
