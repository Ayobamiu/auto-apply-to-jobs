/**
 * Shared config: project root and common paths.
 * All agents use this so .auth, fixtures, and output live at repo root.
 * Multi-user: global/single-file paths in PATHS; user-specific paths from getPathsForUser(userId).
 */
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, '..');

/** Data root: all persistent app data (file-based for MVP). */
export const dataRoot = join(ROOT, 'data');

/** Global / single-file paths (do not depend on userId). */
export const PATHS = {
  auth: join(ROOT, '.auth'),
  fixtures: join(ROOT, 'fixtures'),
  output: join(ROOT, 'output'),
  scrapeScreenshots: join(ROOT, 'output', 'scrape-screenshots'),
  applyScreenshots: join(ROOT, 'output', 'apply-screenshots'),
  profile: join(dataRoot, 'profiles.json'),
  jobsFile: join(dataRoot, 'jobs.json'),
  applyState: join(dataRoot, 'apply-state.json'),
  userJobState: join(dataRoot, 'user-job-state.json'),
  resumes: join(dataRoot, 'resumes'),
  applyForms: join(dataRoot, 'apply-forms'),
  jobCache: join(dataRoot, 'job-cache'),
  job: join(ROOT, 'shared', 'job.json'),
};

const DEFAULT_TRANSCRIPT_PATH = process.env.TRANSCRIPT_PATH ?? join(PATHS.fixtures, 'Unofficial Academic Transcript .pdf');

/** Fallback transcript path (env or fixture). Use when user has no stored transcript. */
export function getTranscriptPathFallback(): string {
  return DEFAULT_TRANSCRIPT_PATH;
}

/**
 * Transcript path for apply: if userId has a stored transcript (S3), download to temp and return path;
 * otherwise return TRANSCRIPT_PATH env or default fixture.
 */
export async function getTranscriptPath(userId?: string): Promise<string> {
  if (!userId || userId === 'default') {
    return getTranscriptPathFallback();
  }
  const { getTranscriptStorageKey } = await import('../data/user-preferences.js');
  const { downloadTranscriptFromS3ToTemp } = await import('./s3-transcript.js');
  const key = await getTranscriptStorageKey(userId);
  if (!key) {
    return getTranscriptPathFallback();
  }
  try {
    const path = await downloadTranscriptFromS3ToTemp(key);
    const { scheduleTempFileCleanup } = await import('./s3-transcript.js');
    scheduleTempFileCleanup(path, 120_000); // delete after 2 min
    return path;
  } catch {
    return getTranscriptPathFallback();
  }
}

import type { UserPaths } from './types.js';
export type { UserPaths } from './types.js';

/** User-specific paths (auth and resume files per user). */
export function getPathsForUser(userId: string): UserPaths {
  const safe = validateUserId(userId);
  return {
    authState: join(ROOT, '.auth', safe, 'handshake-state.json'),
    navigationLog: join(ROOT, '.auth', safe, 'navigation-log.json'),
    resumesDir: join(PATHS.resumes, safe),
  };
}

const USER_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

function validateUserId(userId: string): string {
  if (!userId || typeof userId !== 'string') return 'default';
  const t = userId.trim();
  if (!t || t === '..' || !USER_ID_REGEX.test(t)) return 'default';
  return t;
}

/**
 * Resolve userId from env or argv (--user <id>). Returns 'default' if missing or invalid.
 */
export function resolveUserId(options?: { envUserId?: string; argv?: string[] }): string {
  const env = options?.envUserId ?? process.env.USER_ID;
  if (env && typeof env === 'string') {
    const v = validateUserId(env);
    if (v !== 'default') return v;
  }
  const argv = options?.argv ?? process.argv;
  const i = argv.indexOf('--user');
  if (i !== -1 && argv[i + 1]) {
    const v = validateUserId(argv[i + 1]);
    if (v !== 'default') return v;
  }
  return 'default';
}
