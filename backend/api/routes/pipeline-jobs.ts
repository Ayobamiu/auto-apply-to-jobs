/**
 * GET /pipeline/jobs/:jobId — check status of a pipeline run (auth required).
 * GET /pipeline/jobs — list recent pipeline jobs for the current user (auth required).
 */
import type { Request, Response } from 'express';
import { getPipelineJob, listPipelineJobs } from '../../data/pipeline-jobs.js';
import { normalizePipelineOutcome, getPipelineOutcomeMessage } from '../../shared/pipeline-outcome.js';

export async function getPipelineJobStatus(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const jobId = req.params.jobId as string;
  const job = await getPipelineJob(jobId, userId);
  if (!job) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  let userMessage: string | null = null;
  if (job.status === 'done' && job.result && typeof job.result === 'object') {
    const result = job.result as Record<string, unknown>;
    const outcome = normalizePipelineOutcome(result);
    const jobTitle = String((result.job as Record<string, unknown>)?.title ?? job.job_url ?? '');
    userMessage = outcome ? getPipelineOutcomeMessage(outcome, jobTitle) : null;
  }
  res.status(200).json({
    status: job.status,
    phase: job.phase ?? null,
    jobUrl: job.job_url,
    submit: job.submit,
    result: job.result,
    error: job.error,
    userMessage,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  });
}

export async function getPipelineJobList(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const jobs = await listPipelineJobs(userId);
  res.status(200).json(
    jobs.map((j) => ({
      id: j.id,
      status: j.status,
      phase: j.phase ?? null,
      jobUrl: j.job_url,
      submit: j.submit,
      result: j.result,
      error: j.error,
      createdAt: j.created_at,
      updatedAt: j.updated_at,
    }))
  );
}
