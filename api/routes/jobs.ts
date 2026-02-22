/**
 * GET /jobs and GET /jobs/status (auth required).
 */
import type { Request, Response } from 'express';
import { listJobsWithStatus } from '../../orchestration/list-jobs-with-status.js';
import { getApplicationStatus } from '../../agents/job_scraper_agent/index.js';

export async function getJobs(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const jobs = await listJobsWithStatus(userId);
    res.status(200).json(jobs);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list jobs';
    res.status(500).json({ error: message });
  }
}

export async function getJobsStatus(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const jobUrl = typeof req.query.jobUrl === 'string' ? req.query.jobUrl.trim() : '';
  if (!jobUrl) {
    res.status(400).json({ error: 'jobUrl query parameter is required' });
    return;
  }
  try {
    const status = await getApplicationStatus(jobUrl, { userId, fromStoreOnly: true });
    res.status(200).json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get status';
    res.status(500).json({ error: message });
  }
}
