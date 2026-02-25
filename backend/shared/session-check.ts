/**
 * Check if Handshake session (saved auth state) is still valid without running the full apply flow.
 */
import { chromium } from 'playwright';
import { getHandshakeSessionPath } from '../data/handshake-session.js';

const SESSION_CHECK_TIMEOUT_MS = 15000;
const STABLE_HANDSHAKE_URL = process.env.HANDSHAKE_JOBS_BASE_URL || 'https://app.joinhandshake.com';

export type SessionCheckResult =
  | { valid: true }
  | { valid: false; reason: 'no_session' | 'session_expired' };

export async function checkSessionValid(userId?: string): Promise<SessionCheckResult> {
  const storagePath = await getHandshakeSessionPath(userId ?? 'default');
  if (!storagePath) {
    return { valid: false, reason: 'no_session' };
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ storageState: storagePath });
    const page = await context.newPage();
    await page.goto(STABLE_HANDSHAKE_URL, { waitUntil: 'domcontentloaded', timeout: SESSION_CHECK_TIMEOUT_MS });
    await new Promise((r) => setTimeout(r, 2000));

    const url = page.url();
    const host = new URL(url).hostname.toLowerCase();
    const isLoginPage = host.includes('login') || host.includes('sso.') || host.includes('webauth.') || host.includes('idp.');
    if (isLoginPage) {
      return { valid: false, reason: 'session_expired' };
    }
    return { valid: true };
  } finally {
    await browser.close();
  }
}
