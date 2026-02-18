/**
 * Per-job apply state keyed by job URL.
 * Shape: { [normalizedJobUrl]: { resumePath, uploadedAt, submittedAt? } }
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { PATHS } from './config.js';

function normalizeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    u.hash = '';
    u.searchParams.sort();
    return u.toString().replace(/\/$/, '');
  } catch {
    return String(url);
  }
}

export function loadState() {
  try {
    const raw = readFileSync(PATHS.applyState, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

export function saveState(state) {
  mkdirSync(dirname(PATHS.applyState), { recursive: true });
  writeFileSync(PATHS.applyState, JSON.stringify(state, null, 2), 'utf8');
}

export function getJobState(jobUrl) {
  const key = normalizeUrl(jobUrl);
  const state = loadState();
  return state[key] ?? null;
}

/**
 * @param {string} jobUrl
 * @param {{ resumePath: string, uploadedAt?: string, submittedAt?: string }} data
 */
export function setJobUploaded(jobUrl, data) {
  const key = normalizeUrl(jobUrl);
  const state = loadState();
  state[key] = {
    ...(state[key] || {}),
    resumePath: data.resumePath,
    uploadedAt: data.uploadedAt ?? new Date().toISOString(),
    ...(data.submittedAt != null && { submittedAt: data.submittedAt }),
  };
  saveState(state);
}

export function isJobUploaded(jobUrl) {
  const s = getJobState(jobUrl);
  return !!(s && s.uploadedAt);
}
