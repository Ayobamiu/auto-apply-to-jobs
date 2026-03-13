/**
 * POST /pipeline — create async pipeline job (auth required).
 * Always pass userId from request; do not rely on env or resolveUserId in API path.
 */
import type { Request, Response } from 'express';
import { createPipelineJob } from '../../data/pipeline-jobs.js';
import { getAutomationLevel } from '../../data/user-preferences.js';
import { runPipelineInBackground } from '../../orchestration/run-pipeline-background.js';
import { getJobIdFromUrl, getJobSiteFromUrl } from '../../shared/job-from-url.js';
import { setJobLifecycleStatus, toJobRef } from '../../data/user-job-state.js';

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
    // Mark lifecycle as in_progress immediately so UI reflects it right away.
    // Best-effort only (do not fail pipeline creation if parsing fails).
    try {
      const normalized = jobUrl.trim();
      const site = getJobSiteFromUrl(normalized);
      const jobIdFromUrl = getJobIdFromUrl(normalized);
      if (site && jobIdFromUrl) {
        await setJobLifecycleStatus(userId, toJobRef(site, jobIdFromUrl), 'in_progress');
      }
    } catch {
      // ignore
    }
    const automationLevel = await getAutomationLevel(userId);
    const { id: jobId } = await createPipelineJob(userId, jobUrl.trim(), {
      submit: Boolean(submit),
      forceScrape: Boolean(forceScrape),
      automationLevel,
    });
    setImmediate(() => void runPipelineInBackground(jobId));
    res.status(202).json({ jobId, message: 'Pipeline started. Check status with GET /pipeline/jobs/:jobId' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create pipeline job';
    res.status(500).json({ error: message });
  }
}
