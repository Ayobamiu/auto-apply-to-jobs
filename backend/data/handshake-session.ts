/**
 * Handshake session storage: DB (primary) with file fallback for CLI-created sessions.
 * Callers use the returned path with Playwright's storageState.
 */
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { pool, ensureDataTables } from '../api/db.js';
import { getPathsForUser } from '../shared/config.js';
import { PlaywrightCookie } from '../types/cookies.js';
import { isHandshakeSessionExpired } from '../helpers/handshake-session-handler.js';

const TEMP_DIR = join(tmpdir(), 'handshake-sessions');

function ensureTempDir(): void {
  try {
    mkdirSync(TEMP_DIR, { recursive: true });
  } catch (_) { }
}

/**
 * Save Handshake Playwright storage state for a user (upsert).
 */
export async function saveHandshakeSession(userId: string, stateJson: object): Promise<void> {
  await ensureDataTables();
  await pool.query(
    `INSERT INTO handshake_sessions (user_id, state_json, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (user_id) DO UPDATE SET state_json = EXCLUDED.state_json, updated_at = now()`,
    [userId, JSON.stringify(stateJson)]
  );
}

/**
 * Returns session status for the user: connected and last updated timestamp.
 * Never throws for missing session.
 */
export async function getHandshakeSessionStatus(userId: string): Promise<{
  connected: boolean;
  updatedAt: string | null;
  expired: boolean;
}> {
  await ensureDataTables();
  const res = await pool.query<{ updated_at: Date, state_json: object }>(
    'SELECT updated_at, state_json FROM handshake_sessions WHERE user_id = $1',
    [userId]
  );
  const row = res.rows[0] as {
    updated_at: Date;
    state_json: {
      cookies: PlaywrightCookie[];
      origins: unknown[];
    };
  };
  const stateJson = row?.state_json;
  const expired = isHandshakeSessionExpired({ cookies: stateJson?.cookies ?? [] });
  return {
    connected: !!row,
    updatedAt: row?.updated_at?.toISOString() ?? null,
    expired: expired,
  };
}

/**
 * Returns milliseconds since the session was last updated, or null if no session exists.
 */
export async function getSessionAge(userId: string): Promise<number | null> {
  await ensureDataTables();
  const res = await pool.query<{ updated_at: Date }>(
    'SELECT updated_at FROM handshake_sessions WHERE user_id = $1',
    [userId]
  );
  if (!res.rows[0]) return null;
  return Date.now() - new Date(res.rows[0].updated_at).getTime();
}

/**
 * Return a path Playwright can use for storageState. Prefers DB; falls back to file.
 * Returns null if no session exists.
 */
export async function getHandshakeSessionPath(userId: string): Promise<string | null> {
  await ensureDataTables();
  const res = await pool.query<{ state_json: object }>(
    'SELECT state_json FROM handshake_sessions WHERE user_id = $1',
    [userId]
  );
  if (res.rows[0]) {
    ensureTempDir();
    const path = join(TEMP_DIR, `${userId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
    writeFileSync(path, JSON.stringify(res.rows[0].state_json), 'utf-8');
    return path;
  }
  const filePath = getPathsForUser(userId).authState;
  if (existsSync(filePath)) return filePath;
  return null;
}

/**
 * Playwright `browser.newContext` options: DB session (temp file) or `.auth/<userId>/` file fallback.
 */
export async function resolvePlaywrightStorageStateForUser(
  userId: string | undefined,
  useAuth: boolean,
): Promise<{ storageState: string } | Record<string, never>> {
  if (!useAuth) return {};
  const path = await getHandshakeSessionPath(userId ?? 'default');
  return path ? { storageState: path } : {};
}
