/**
 * Job cache: HTML of scraped job pages by id. CRUD-style API for future DB swap.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { PATHS } from '../shared/config.js';

function ensureJobCacheDir(): void {
  try {
    mkdirSync(PATHS.jobCache, { recursive: true });
  } catch (_) {}
}

export function getCachedJobHtml(id: string): string | null {
  if (!id) return null;
  const path = join(PATHS.jobCache, `${id}.html`);
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return null;
    throw err;
  }
}

export function setCachedJobHtml(id: string, html: string): void {
  if (!id) return;
  ensureJobCacheDir();
  const path = join(PATHS.jobCache, `${id}.html`);
  writeFileSync(path, html, 'utf8');
}
