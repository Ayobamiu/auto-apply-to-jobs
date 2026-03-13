/**
 * GET /jobs, GET /jobs/status, GET /jobs/detail (auth required).
 */
import type { Request, Response } from 'express';
import { listJobsWithStatus } from '../../orchestration/list-jobs-with-status.js';
import { getApplicationStatus, runJobScraper } from '../../agents/job_scraper_agent/index.js';
import { getJob } from '../../data/jobs.js';
import { getSubmittedJobs, getUserJobState, setJobLifecycleStatus, getJobsByLifecycle } from '../../data/user-job-state.js';
import { getResumeForJob } from '../../data/job-artifacts.js';
import { getLatestPipelineJobByJobUrl } from '../../data/pipeline-jobs.js';
import { normalizePipelineOutcome, getPipelineOutcomeMessage } from '../../shared/pipeline-outcome.js';
import { isNonRetryableFailureCode } from '../../shared/errors.js';

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

export async function getJobsDetail(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const jobRef = typeof req.query.jobRef === 'string' ? req.query.jobRef.trim() : '';
  if (!jobRef || !jobRef.includes(':')) {
    res.status(400).json({ error: 'jobRef query parameter is required (e.g. handshake:10803825)' });
    return;
  }
  const i = jobRef.indexOf(':');
  const site = jobRef.slice(0, i);
  const jobId = jobRef.slice(i + 1);
  if (!site || !jobId) {
    res.status(400).json({ error: 'Invalid jobRef' });
    return;
  }
  try {
    const job = await getJob(site, jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    const jobUrl = job.url || (site === 'handshake' ? `https://wmich.joinhandshake.com/jobs/${jobId}` : null);
    const [userState, resume, pipelineJob] = await Promise.all([
      getUserJobState(userId, jobRef),
      getResumeForJob(userId, site, jobId),
      jobUrl ? getLatestPipelineJobByJobUrl(userId, jobUrl) : Promise.resolve(null),
    ]);
    const pipeline = pipelineJob
      ? (() => {
        let userMessage: string | null = null;
        if (pipelineJob.status === 'done' && pipelineJob.result && typeof pipelineJob.result === 'object') {
          const result = pipelineJob.result as Record<string, unknown>;
          const outcome = normalizePipelineOutcome(result);
          const jobTitle = String((result.job as Record<string, unknown>)?.title ?? pipelineJob.job_url ?? '');
          userMessage = outcome ? getPipelineOutcomeMessage(outcome, jobTitle) : null;
        }
        return {
          id: pipelineJob.id,
          status: pipelineJob.status,
          phase: pipelineJob.phase ?? null,
          result: pipelineJob.result,
          error: pipelineJob.error,
          error_code: pipelineJob.error_code ?? null,
          retryAllowed: !isNonRetryableFailureCode(pipelineJob.error_code ?? null),
          createdAt: pipelineJob.created_at,
          updatedAt: pipelineJob.updated_at,
          userMessage,
        };
      })()
      : null;
    res.status(200).json({
      job: { ...job, jobId, site },
      userState: userState ?? null,
      hasResume: !!resume,
      pipelineJob: pipeline,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load job detail';
    res.status(500).json({ error: message });
  }
}

export async function postScrapeJobDetail(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const { jobRef } = req.body;
  if (!jobRef) {
    res.status(400).json({ error: 'jobRef is required' });
    return;
  }
  if (!jobRef || !jobRef.includes(':')) {
    res.status(400).json({ error: 'jobRef query parameter is required (e.g. handshake:10803825)' });
    return;
  }
  const i = jobRef.indexOf(':');
  const site = jobRef.slice(0, i);
  const jobId = jobRef.slice(i + 1);
  if (!site || !jobId) {
    res.status(400).json({ error: 'Invalid jobRef' });
    return;
  }
  const jobUrl = site === 'handshake' ? `https://wmich.joinhandshake.com/jobs/${jobId}` : null;
  if (jobUrl) {
    const { job: scrapedJob } = await runJobScraper(jobUrl, { forceScrape: false });
    if (scrapedJob) {
      res.status(200).json({ job: scrapedJob });
    } else {
      res.status(500).json({ error: 'Failed to scrape job' });
    }
  } else {
    res.status(404).json({ error: 'Job not found' });
  }
}

export async function getSubmittedJobList(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const jobs = await getSubmittedJobs(userId);
    res.status(200).json(jobs);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get submitted jobs';
    res.status(500).json({ error: message });
  }
}

/** POST /jobs/save — mark a job as saved in the lifecycle. */
export async function postSaveJob(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const { jobRef } = req.body ?? {};
  if (typeof jobRef !== 'string' || !jobRef.includes(':')) {
    res.status(400).json({ error: 'jobRef is required (e.g. handshake:10803825)' });
    return;
  }
  try {
    await setJobLifecycleStatus(userId, jobRef, 'saved');
    res.status(200).json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save job';
    res.status(500).json({ error: message });
  }
}

/** GET /jobs/lifecycle-list?status=saved|in_progress|submitted */
export async function getJobLifecycleList(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  if (status !== 'saved' && status !== 'in_progress' && status !== 'submitted') {
    res.status(400).json({ error: 'status must be saved, in_progress, or submitted' });
    return;
  }
  try {
    const jobs = await getJobsByLifecycle(userId, status);
    res.status(200).json(jobs);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get jobs';
    res.status(500).json({ error: message });
  }
}
