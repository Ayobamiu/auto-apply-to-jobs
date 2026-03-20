/**
 * User preferences: onboarding state and future settings.
 */
import { pool, ensureDataTables } from '../api/db.js';

const USER_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

function validateUserId(userId: string): boolean {
  return !!userId && typeof userId === 'string' && USER_ID_REGEX.test(userId.trim());
}

export async function getOnboardingComplete(userId: string): Promise<boolean> {
  if (!validateUserId(userId)) return false;
  await ensureDataTables();
  const res = await pool.query<{ onboarding_complete: boolean }>(
    'SELECT onboarding_complete FROM user_preferences WHERE user_id = $1',
    [userId]
  );
  return res.rows[0]?.onboarding_complete ?? false;
}

export async function setOnboardingComplete(userId: string): Promise<void> {
  if (!validateUserId(userId)) return;
  await ensureDataTables();
  await pool.query(
    `INSERT INTO user_preferences (user_id, onboarding_complete, updated_at)
     VALUES ($1, true, now())
     ON CONFLICT (user_id) DO UPDATE SET onboarding_complete = true, updated_at = now()`,
    [userId]
  );
}

export type AutomationLevel = 'full' | 'review';

export async function getAutomationLevel(userId: string): Promise<AutomationLevel> {
  if (!validateUserId(userId)) return 'review';
  await ensureDataTables();
  const res = await pool.query<{ automation_level: string | null }>(
    'SELECT automation_level FROM user_preferences WHERE user_id = $1',
    [userId]
  );
  const level = res.rows[0]?.automation_level;
  return level === 'full' || level === 'review' ? level : 'review';
}

export async function setAutomationLevel(userId: string, level: AutomationLevel): Promise<void> {
  if (!validateUserId(userId)) return;
  await ensureDataTables();
  await pool.query(
    `INSERT INTO user_preferences (user_id, automation_level, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET automation_level = $2, updated_at = now()`,
    [userId, level]
  );
}

export async function getTranscriptStorageKey(userId: string): Promise<string | null> {
  if (!validateUserId(userId)) return null;
  await ensureDataTables();
  const res = await pool.query<{ transcript_storage_key: string | null }>(
    'SELECT transcript_storage_key FROM user_preferences WHERE user_id = $1',
    [userId]
  );
  const key = res.rows[0]?.transcript_storage_key;
  return key && key.trim() ? key.trim() : null;
}

export async function setTranscriptStorageKey(userId: string, key: string): Promise<void> {
  if (!validateUserId(userId)) return;
  await ensureDataTables();
  await pool.query(
    `INSERT INTO user_preferences (user_id, transcript_storage_key, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET transcript_storage_key = $2, updated_at = now()`,
    [userId, key]
  );
}

export async function hasTranscript(userId: string): Promise<{ hasTranscript: boolean, transcriptStorageKey: string | null }> {
  const key = await getTranscriptStorageKey(userId);
  return { hasTranscript: !!key, transcriptStorageKey: key };
}

export interface JobSearchFilters {
  query?: string;
  location?: string;
  employmentTypes?: string[];
  jobTypes?: string[];
  remoteWork?: string[];
  workAuthorization?: string[];
  pagination?: { page: number; perPage: number };
  handshake?: { locationFilter?: string | object };
}

function parseStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const x of v) if (typeof x === 'string' && x.trim()) out.push(x.trim());
  return out.length ? out : undefined;
}

function parsePagination(v: unknown): { page: number; perPage: number } | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const page = typeof o.page === 'number' ? o.page : typeof o.page === 'string' ? parseInt(String(o.page), 10) : undefined;
  const perPage = typeof o.perPage === 'number' ? o.perPage : typeof o.perPage === 'string' ? parseInt(String(o.perPage), 10) : undefined;
  if (page == null || perPage == null || !Number.isFinite(page) || !Number.isFinite(perPage) || page < 1 || perPage < 1) return undefined;
  return { page, perPage };
}

export async function getJobSearchFilters(userId: string): Promise<JobSearchFilters | null> {
  if (!validateUserId(userId)) return null;
  await ensureDataTables();
  const res = await pool.query<{ job_search_filters: JobSearchFilters | null }>(
    'SELECT job_search_filters FROM user_preferences WHERE user_id = $1',
    [userId]
  );
  const raw = res.rows[0]?.job_search_filters;
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const handshakeRaw = r.handshake;
  let handshake: JobSearchFilters['handshake'];
  if (handshakeRaw && typeof handshakeRaw === 'object' && handshakeRaw !== null) {
    const h = handshakeRaw as Record<string, unknown>;
    handshake = { locationFilter: h.locationFilter as string | object | undefined };
  } else {
    handshake = undefined;
  }
  return {
    query: typeof r.query === 'string' ? r.query.trim() || undefined : undefined,
    location: typeof r.location === 'string' ? r.location.trim() || undefined : undefined,
    employmentTypes: parseStringArray(r.employmentTypes),
    jobTypes: parseStringArray(r.jobTypes),
    remoteWork: parseStringArray(r.remoteWork),
    workAuthorization: parseStringArray(r.workAuthorization),
    pagination: parsePagination(r.pagination),
    handshake: handshake?.locationFilter != null ? handshake : undefined,
  };
}

export async function setJobSearchFilters(userId: string, filters: JobSearchFilters): Promise<void> {
  if (!validateUserId(userId)) return;
  await ensureDataTables();
  const payload: Record<string, unknown> = {
    query: filters.query ?? null,
    location: filters.location ?? null,
    employmentTypes: filters.employmentTypes ?? null,
    jobTypes: filters.jobTypes ?? null,
    remoteWork: filters.remoteWork ?? null,
    workAuthorization: filters.workAuthorization ?? null,
    pagination: filters.pagination ?? null,
    handshake: filters.handshake ?? null,
  };
  await pool.query(
    `INSERT INTO user_preferences (user_id, job_search_filters, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (user_id) DO UPDATE SET job_search_filters = $2::jsonb, updated_at = now()`,
    [userId, JSON.stringify(payload)]
  );
}

export async function getLastRefreshAt(userId: string): Promise<Date | null> {
  if (!validateUserId(userId)) return null;
  await ensureDataTables();
  const res = await pool.query<{ last_refresh_at: Date | null }>(
    'SELECT last_refresh_at FROM user_preferences WHERE user_id = $1',
    [userId]
  );
  const at = res.rows[0]?.last_refresh_at;
  return at ? new Date(at) : null;
}

export async function setLastRefreshAt(userId: string, at: Date): Promise<void> {
  if (!validateUserId(userId)) return;
  await ensureDataTables();
  await pool.query(
    `INSERT INTO user_preferences (user_id, last_refresh_at, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET last_refresh_at = $2, updated_at = now()`,
    [userId, at]
  );
}
