/**
 * Handshake session upload: accept cookies from Chrome extension, store in DB.
 * GET /handshake/session/status — check if user has a connected session (auth required).
 */
import type { Request, Response } from 'express';
import { saveHandshakeSession, getHandshakeSessionStatus } from '../../data/handshake-session.js';
import type { ChromeCookie, PlaywrightCookie } from '../../types/cookies.js';


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
 * Body: { cookies: ChromeCookie[], originUrl: string }
 * Stores the specific university origin alongside session cookies.
 */
export async function postHandshakeSessionUpload(req: Request, res: Response): Promise<void> {
  const userId = (req as Request & { userId?: string }).userId;

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { cookies: rawCookies, originUrl } = req.body as {
    cookies?: any[];
    originUrl?: string
  };

  if (!rawCookies || !Array.isArray(rawCookies)) {
    res.status(400).json({ error: 'Body must include cookies array' });
    return;
  }

  if (!originUrl) {
    res.status(400).json({ error: 'Missing originUrl (University Portal)' });
    return;
  }

  try {
    // 1. Convert Chrome cookies to Playwright format
    const cookies = rawCookies.map(chromeToPlaywrightCookie);

    // 2. Extract the University slug for internal tracking (optional)
    // e.g., "wmich" from "https://wmich.joinhandshake.com"
    const universityDomain = new URL(originUrl).hostname;

    // 3. Save the full state (Cookies + Origin)
    const stateJson = {
      cookies,
      originUrl,
      syncedAt: new Date().toISOString(),
      domain: universityDomain
    };

    await saveHandshakeSession(userId, stateJson);

    res.status(200).json({
      ok: true,
      message: `Session synced for ${universityDomain}`
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save session';
    res.status(500).json({ error: message });
  }
}

/**
 * GET /handshake/session/status
 * Returns { connected: boolean, updatedAt: string | null, expired: boolean }.
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
    res.status(200).json({ connected: false, updatedAt: null, expired: true });
  }
}
