/**
 * Shared config: project root and common paths.
 * All agents use this so .auth, fixtures, and output live at repo root.
 */
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, '..');

export const PATHS = {
  auth: join(ROOT, '.auth'),
  authState: join(ROOT, '.auth', 'handshake-state.json'),
  navigationLog: join(ROOT, '.auth', 'navigation-log.json'),
  fixtures: join(ROOT, 'fixtures'),
  output: join(ROOT, 'output'),
  jobCache: join(ROOT, 'output', 'job-cache'),
  applyState: join(ROOT, 'output', 'apply-state.json'),
  profile: join(ROOT, 'shared', 'profile.json'),
  job: join(ROOT, 'shared', 'job.json'),
};
