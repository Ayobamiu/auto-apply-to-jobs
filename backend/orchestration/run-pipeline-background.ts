/**
 * Background runner for async pipeline jobs.
 * Loads a pipeline_jobs row, runs the pipeline, updates the row with result or error.
 * Always pass userId from the job row; do not rely on env or resolveUserId in API path.
 */
import { getPipelineJobById, updatePipelineJobStatus } from '../data/pipeline-jobs.js';
import { runPipelineForJob } from './run-pipeline.js';

export type RunPipelineFn = typeof runPipelineForJob;

export async function runPipelineInBackground(
  jobId: string,
  pipelineFn: RunPipelineFn = runPipelineForJob
): Promise<void> {
  const job = await getPipelineJobById(jobId);
  if (!job || job.status !== 'pending') return;

  await updatePipelineJobStatus(jobId, 'running');

  try {
    const result = await pipelineFn(job.job_url, {
      userId: job.user_id,
      submit: job.submit,
      forceScrape: job.force_scrape,
    });
    await updatePipelineJobStatus(jobId, 'done', result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updatePipelineJobStatus(jobId, 'failed', undefined, message);
  }
}
