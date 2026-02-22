/**
 * Load Job description (for resume tailoring and pipeline).
 */
import { readFileSync } from 'fs';
import { PATHS } from './config.js';
import type { Job } from './types.js';

export function loadJob(path: string = PATHS.job): Job {
  try {
    const raw = readFileSync(path, 'utf8');
    if (path.endsWith('.json')) {
      return JSON.parse(raw) as Job;
    }
    return { description: raw, title: '', company: '' };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return { description: '', title: '', company: '' };
    throw err;
  }
}
