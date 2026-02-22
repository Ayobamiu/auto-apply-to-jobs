/**
 * Check if Handshake session (saved auth state) is still valid without running the full apply flow.
 * Used by apply script and pipeline so UI/CLI can fail fast with NO_SESSION or SESSION_EXPIRED.
 */
import { existsSync } from 'fs';
import { chromium } from 'playwright';
import { PATHS } from './config.js';

const SESSION_CHECK_TIMEOUT_MS = 15000;
const STABLE_HANDSHAKE_URL = process.env.HANDSHAKE_JOBS_BASE_URL || 'https://app.joinhandshake.com';

/**
 * Load storage state from PATHS.authState; launch headless browser, restore context, goto Handshake URL,
 * then check if we're on a login page. Close browser when done.
 * @returns {{ valid: true } | { valid: false, reason: 'no_session' | 'session_expired' }}
 */
export async function checkSessionValid() {
  if (!existsSync(PATHS.authState)) {
    return { valid: false, reason: 'no_session' };
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ storageState: PATHS.authState });
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
