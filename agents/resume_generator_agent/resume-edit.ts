/**
 * Update tailored resume for a job from a chat message. Loads JSON, calls LLM, saves back. No PDF.
 */
import { getJob } from '../../data/jobs.js';
import { getResumeJsonPathForJob, readResumeJson, writeResumeJson } from '../../data/resumes.js';
import { updateResumeFromChat } from './assistant.js';
import { AppError, CODES } from '../../shared/errors.js';

export interface UpdateResumeForJobOptions {
  apiKey?: string;
  model?: string;
  userId?: string;
}

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
  const jsonPath = await getResumeJsonPathForJob(site, jobId, userId);
  if (!jsonPath) {
    throw new AppError(CODES.NO_RESUME);
  }

  const resumeJson = readResumeJson(jsonPath);
  const updated = await updateResumeFromChat(resumeJson, userMessage, options);
  writeResumeJson(jsonPath, updated);
  return updated;
}
