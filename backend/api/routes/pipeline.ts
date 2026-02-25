/**
 * POST /pipeline — run pipeline for a job (auth required).
 */
import type { Request, Response } from 'express';
import { runPipelineForJob } from '../../orchestration/run-pipeline.js';

export async function postPipeline(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const { jobUrl, submit, forceScrape } = req.body ?? {};
  if (typeof jobUrl !== 'string' || !jobUrl.trim()) {
    res.status(400).json({ error: 'jobUrl is required' });
    return;
  }
  try {
    const result = await runPipelineForJob(jobUrl.trim(), {
      userId,
      submit: Boolean(submit),
      forceScrape: Boolean(forceScrape),
    });
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Pipeline failed';
    res.status(500).json({ error: message });
  }
}
