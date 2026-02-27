/**
 * Update tailored resume for a job from a chat message. Loads from DB, calls LLM, saves back. No PDF.
 */
import { getJob } from '../../data/jobs.js';
import { getResumeForJob, saveResumeForJob } from '../../data/job-artifacts.js';
import { updateResumeFromChat } from './assistant.js';
import { AppError, CODES } from '../../shared/errors.js';

export type { UpdateResumeForJobOptions } from '../../shared/types.js';
import type { UpdateResumeForJobOptions } from '../../shared/types.js';

/**
 * Edit the resume for a job per user message. Requires OPENAI_API_KEY (or options.apiKey).
 */
export async function updateResumeForJob(
  site: string,
  jobId: string,
  userMessage: string,
  options: UpdateResumeForJobOptions = {}
): Promise<Record<string, unknown>> {
  const userId = options.userId ?? 'default';
  await getJob(site, jobId); // ensure job exists (optional check)
  const resumeJson = await getResumeForJob(userId, site, jobId);
  if (!resumeJson) {
    throw new AppError(CODES.NO_RESUME);
  }

  const updated = await updateResumeFromChat(resumeJson, userMessage, options);
  await saveResumeForJob(userId, site, jobId, updated);
  return updated;
}
