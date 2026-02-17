/**
 * Load Job description (for resume tailoring and pipeline).
 */
import { readFileSync } from 'fs';
import { PATHS } from './config.js';

export function loadJob(path = PATHS.job) {
  try {
    const raw = readFileSync(path, 'utf8');
    if (path.endsWith('.json')) {
      return JSON.parse(raw);
    }
    return { description: raw, title: '', company: '' };
  } catch (err) {
    if (err.code === 'ENOENT') return { description: '', title: '', company: '' };
    throw err;
  }
}
