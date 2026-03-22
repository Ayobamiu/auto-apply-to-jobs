/**
 * Detect when a "job" scrape actually captured Handshake login / SSO HTML.
 * Without storageState on the server, h1 is often "Sign up or log in" — do not persist that as job data.
 */
import type { Job } from './types.js';

const AUTH_WALL_TITLE_PATTERNS: RegExp[] = [
  /sign up or log in/i,
  /^log in(\s*\||\s*·|\s*$)/i,
  /^sign in(\s*\||\s*·|\s*$)/i,
  /^join handshake/i,
  /verify it'?s you/i,
  /^authenticate$/i,
  /log in to continue/i,
  /session expired/i,
  /^log in to handshake/i,
  /^sign in to handshake/i,
];

export function isHandshakeAuthWallScrape(job: {
  title?: string;
  description?: string;
  company?: string;
  applyType?: string;
}): boolean {
  const t = (job.title || '').trim();
  if (!t) return false;
  if (AUTH_WALL_TITLE_PATTERNS.some((re) => re.test(t))) return true;
  return false;
}

/** Existing DB row looks like a real listing (safe to keep when a new scrape hits the login wall). */
export function jobRowHasSubstantialContent(job: Partial<Job>): boolean {
  const desc = (job.description || '').trim().length;
  const company = (job.company || '').trim().length;
  return desc >= 80 || (company >= 2 && desc >= 40);
}
