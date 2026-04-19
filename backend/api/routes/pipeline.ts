/**
 * POST /pipeline — create async pipeline job (auth required).
 *
 * Contract (phase 1 queueing):
 *  - If the user already has an in-flight row (pending | running | awaiting_approval)
 *    whose canonical URL matches the submitted one → return 200 with that jobId
 *    (idempotent resubmit).
 *  - Else if the user already has PIPELINE_QUEUE_CAP in-flight rows → 409 QUEUE_FULL.
 *  - Else insert a new `pending` row and ask the dispatcher to promote the oldest
 *    pending row (which is usually this one) to `running` iff nothing else is
 *    running for this user.
 *
 * Always pass userId from request; do not rely on env or resolveUserId in API path.
 */
import type { Request, Response } from 'express';
import { enqueuePipelineJob } from '../../data/pipeline-jobs.js';
import { getAutomationLevel } from '../../data/user-preferences.js';
import { dispatchNextForUser } from '../../orchestration/dispatch-pending.js';
import { getJobIdFromUrl, getJobSiteFromUrl } from '../../shared/job-from-url.js';
import { setJobLifecycleStatus, toJobRef } from '../../data/user-job-state.js';

export const PIPELINE_QUEUE_CAP = 3;

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
  const normalized = jobUrl.trim();
  try {
    const automationLevel = await getAutomationLevel(userId);
    const enqueueResult = await enqueuePipelineJob({
      userId,
      jobUrl: normalized,
      cap: PIPELINE_QUEUE_CAP,
      submit: Boolean(submit),
      forceScrape: Boolean(forceScrape),
      automationLevel,
    });

    if (!enqueueResult.ok) {
      res.status(409).json({
        error: 'QUEUE_FULL',
        message: `You have ${enqueueResult.cap} jobs in your queue. Review or cancel one to add another.`,
        inFlightCount: enqueueResult.inFlight,
        cap: enqueueResult.cap,
      });
      return;
    }

    if (!enqueueResult.reused) {
      try {
        const site = getJobSiteFromUrl(normalized);
        const jobIdFromUrl = getJobIdFromUrl(normalized);
        if (site && jobIdFromUrl) {
          await setJobLifecycleStatus(userId, toJobRef(site, jobIdFromUrl), 'in_progress');
        }
      } catch { /* best-effort */ }
    }

    void dispatchNextForUser(userId);

    res.status(enqueueResult.reused ? 200 : 202).json({
      jobId: enqueueResult.jobId,
      reused: enqueueResult.reused,
      inFlightCount: enqueueResult.inFlight,
      message: enqueueResult.reused
        ? 'Existing in-flight pipeline job for this URL returned.'
        : 'Pipeline queued. Check status with GET /pipeline/jobs/:jobId',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create pipeline job';
    res.status(500).json({ error: message });
  }
}
