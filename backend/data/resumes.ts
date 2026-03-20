/**
 * Resume paths per job: resolve from user-job-state (resumeBasename) and user's resumes dir.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { getPathsForUser } from '../shared/config.js';
import { getUserJobState, toJobRef } from './user-job-state.js';

const DEFAULT_USER_ID = 'default';

export async function getResumePathsForJob(
  site: string,
  jobId: string,
  userId?: string
): Promise<{ jsonPath: string; pdfPath: string }> {
  const uid = userId ?? DEFAULT_USER_ID;
  const jobRef = toJobRef(site, jobId);
  const state = await getUserJobState(uid, jobRef);
  const basename = state?.resumeBasename;
  if (!basename) {
    return { jsonPath: '', pdfPath: '' };
  }
  const { resumesDir } = getPathsForUser(uid);
  return {
    jsonPath: join(resumesDir, `${basename}.json`),
    pdfPath: join(resumesDir, `${basename}.pdf`),
  };
}

export async function getResumeJsonPathForJob(
  site: string,
  jobId: string,
  userId?: string
): Promise<string | null> {
  const { jsonPath } = await getResumePathsForJob(site, jobId, userId);
  return jsonPath && jsonPath.length > 0 ? jsonPath : null;
}

export function readResumeJson(jsonPath: string): Record<string, unknown> {
  const raw = readFileSync(jsonPath, 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

export function writeResumeJson(jsonPath: string, json: Record<string, unknown>): void {
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(json, null, 2), 'utf8');
}
