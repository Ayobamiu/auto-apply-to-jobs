/**
 * Minimal Express API: only POST /handshake/session/upload (JWT auth).
 */
import './bootstrap.js';
import { resolve } from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: resolve(process.cwd(), '.env'), override: true });

import express, { type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool, saveHandshakeSession } from './db.js';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }
  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'Server misconfiguration: JWT_SECRET not set' });
    return;
  }
  try {
    const payload = jwt.verify(token, secret) as { sub: string };
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

type ChromeCookie = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  expirationDate?: number;
  sameSite?: 'no_restriction' | 'lax' | 'strict';
};

type PlaywrightCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
};

function chromeToPlaywright(c: ChromeCookie): PlaywrightCookie {
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

async function postHandshakeSessionUpload(req: Request, res: Response): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const { cookies: rawCookies, originUrl } = (req.body || {}) as { cookies?: ChromeCookie[]; originUrl?: string };
  if (!rawCookies || !Array.isArray(rawCookies)) {
    res.status(400).json({ error: 'Body must include cookies array' });
    return;
  }
  if (!originUrl) {
    res.status(400).json({ error: 'Missing originUrl (University Portal)' });
    return;
  }
  try {
    const cookies = rawCookies.map(chromeToPlaywright);
    const universityDomain = new URL(originUrl).hostname;
    const stateJson = {
      cookies,
      originUrl,
      syncedAt: new Date().toISOString(),
      domain: universityDomain,
    };
    await saveHandshakeSession(req.userId, stateJson);
    res.status(200).json({ ok: true, message: `Session synced for ${universityDomain}` });
  } catch (err) {
    console.log(err);
    const message = err instanceof Error ? err.message : 'Failed to save session';
    res.status(500).json({ error: message });
  }
}

const app = express();
app.use(express.json());

app.post('/handshake/session/upload', authMiddleware, postHandshakeSessionUpload);

const port = Number(process.env.PORT) || 3001;

async function start() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set in .env');
    process.exit(1);
  }
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    process.exit(1);
  }
  app.listen(port, () => {
    console.log(`mini-backend listening on http://localhost:${port}`);
  });
}

start();
