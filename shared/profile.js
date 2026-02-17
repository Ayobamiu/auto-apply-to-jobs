/**
 * Load and validate Profile (single source of truth for resume/apply agents).
 */
import { readFileSync } from 'fs';
import { PATHS } from './config.js';

const DEFAULT_PROFILE = {
  name: '',
  email: '',
  phone: '',
  linkedin: '',
  summary: '',
  education: [],
  experience: [],
  skills: [],
};

export function loadProfile(path = PATHS.profile) {
  try {
    const raw = readFileSync(path, 'utf8');
    const data = JSON.parse(raw);
    return { ...DEFAULT_PROFILE, ...data };
  } catch (err) {
    if (err.code === 'ENOENT') return DEFAULT_PROFILE;
    throw err;
  }
}
