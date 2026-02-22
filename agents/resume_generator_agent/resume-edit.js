/**
 * Update tailored resume for a job from a chat message. Loads JSON, calls LLM, saves back. No PDF.
 */
import { getJob } from '../../data/jobs.js';
import { getResumeJsonPathForJob, readResumeJson, writeResumeJson } from '../../data/resumes.js';
import { updateResumeFromChat } from './assistant.js';
import { AppError, CODES } from '../../shared/errors.js';

/**
 * Edit the resume for a job per user message. Requires OPENAI_API_KEY (or options.apiKey).
 * @param {string} site - e.g. 'handshake'
 * @param {string} jobId - Job ID
 * @param {string} userMessage - Edit request (e.g. "Add skill Python")
 * @param {{ apiKey?: string, model?: string }} [options]
 * @returns {Promise<object>} Updated JSON Resume document
 */
export async function updateResumeForJob(site, jobId, userMessage, options = {}) {
  const job = getJob(site, jobId);
  const jsonPath = getResumeJsonPathForJob(site, jobId);
  if (!jsonPath) {
    throw new AppError(CODES.NO_RESUME);
  }

  const resumeJson = readResumeJson(jsonPath);
  const updated = await updateResumeFromChat(resumeJson, userMessage, options);
  writeResumeJson(jsonPath, updated);
  return updated;
}
