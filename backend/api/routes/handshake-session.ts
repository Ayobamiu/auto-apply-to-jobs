/**
 * Handshake session upload: accept cookies from Chrome extension, store in DB.
 * GET /handshake/session/status — check if user has a connected session (auth required).
 */
import type { Request, Response } from 'express';
import { saveHandshakeSession, getHandshakeSessionStatus } from '../../data/handshake-session.js';

/** Chrome cookie format (from chrome.cookies API). */
interface ChromeCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  expirationDate?: number;
  sameSite?: 'no_restriction' | 'lax' | 'strict';
}

/** Playwright storage state cookie (expires in seconds since epoch). */
interface PlaywrightCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

function chromeToPlaywrightCookie(c: ChromeCookie): PlaywrightCookie {
  const expires =
    c.expirationDate != null && c.expirationDate > 0
      ? Math.floor(c.expirationDate)
      : Math.floor(Date.now() / 1000) + 86400 * 365;
  let sameSite: 'Strict' | 'Lax' | 'None' | undefined;
  if (c.sameSite === 'strict') sameSite = 'Strict';
  else if (c.sameSite === 'lax') sameSite = 'Lax';
  else if (c.sameSite === 'no_restriction') sameSite = 'None';
  return {
    name: c.name,
    value: c.value,
    domain: c.domain ?? '',
    path: c.path ?? '/',
    expires,
    httpOnly: c.httpOnly,
    secure: c.secure,
    ...(sameSite && { sameSite }),
  };
}

/**
 * POST /handshake/session/upload
 * Body: { cookies: ChromeCookie[], origins?: unknown[] }
 * Stores Playwright-compatible state in handshake_sessions for req.userId.
 */
export async function postHandshakeSessionUpload(req: Request, res: Response): Promise<void> {
  const userId = (req as Request & { userId?: string }).userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const body = req.body as { cookies?: ChromeCookie[]; origins?: unknown[] } | undefined;
  if (!body || !Array.isArray(body.cookies)) {
    res.status(400).json({ error: 'Body must include cookies array' });
    return;
  }
  try {
    const cookies = body.cookies.map(chromeToPlaywrightCookie);
    const origins = Array.isArray(body.origins) ? body.origins : [];
    const stateJson = { cookies, origins };
    await saveHandshakeSession(userId, stateJson);
    res.status(200).json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save session';
    res.status(500).json({ error: message });
  }
}

/**
 * GET /handshake/session/status
 * Returns { connected: boolean, updatedAt: string | null }.
 */
export async function getHandshakeSessionStatusHandler(req: Request, res: Response): Promise<void> {
  const userId = (req as Request & { userId?: string }).userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const status = await getHandshakeSessionStatus(userId);
    res.status(200).json(status);
  } catch {
    res.status(200).json({ connected: false, updatedAt: null });
  }
}
