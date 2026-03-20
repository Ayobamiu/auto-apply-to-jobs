/**
 * Apply form schema per job (captured when apply modal is open). CRUD-style API for future DB swap.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { PATHS } from '../shared/config.js';
// TODO: move to DB

function ensureApplyFormsDir(): void {
  try {
    mkdirSync(PATHS.applyForms, { recursive: true });
  } catch (_) { }
}

export function getApplyFormSchema(jobId: string): Record<string, unknown> | null {
  if (!jobId) return null;
  const path = join(PATHS.applyForms, `${jobId}.json`);
  try {
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return null;
    throw err;
  }
}

export function saveApplyFormSchema(jobId: string, schema: Record<string, unknown>): void {
  if (!jobId) return;
  ensureApplyFormsDir();
  const path = join(PATHS.applyForms, `${jobId}.json`);
  writeFileSync(path, JSON.stringify(schema, null, 2), 'utf8');
}
