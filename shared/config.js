/**
 * Shared config: project root and common paths.
 * All agents use this so .auth, fixtures, and output live at repo root.
 */
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, '..');

/** Data root: all persistent app data (file-based for MVP). */
export const dataRoot = join(ROOT, 'data');

export const PATHS = {
  auth: join(ROOT, '.auth'),
  authState: join(ROOT, '.auth', 'handshake-state.json'),
  navigationLog: join(ROOT, '.auth', 'navigation-log.json'),
  fixtures: join(ROOT, 'fixtures'),
  output: join(ROOT, 'output'),
  scrapeScreenshots: join(ROOT, 'output', 'scrape-screenshots'),
  applyScreenshots: join(ROOT, 'output', 'apply-screenshots'),
  // Data layer paths (under data/)
  profile: join(dataRoot, 'profile.json'),
  jobsFile: join(dataRoot, 'jobs.json'),
  applyState: join(dataRoot, 'apply-state.json'),
  resumes: join(dataRoot, 'resumes'),
  applyForms: join(dataRoot, 'apply-forms'),
  jobCache: join(dataRoot, 'job-cache'),
  // Legacy / shared
  job: join(ROOT, 'shared', 'job.json'),
};
