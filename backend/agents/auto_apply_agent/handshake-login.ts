/**
 * Real Handshake: open login page, wait for manual login, save session to .auth/<userId>/handshake-state.json.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';
import { getPathsForUser, resolveUserId, ROOT } from '../../shared/config.js';
import { MANUAL_LOGIN_TIMEOUT_MS } from '../../shared/constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function ensureAuthDirForUser(userId: string): void {
  try {
    mkdirSync(join(ROOT, '.auth', userId), { recursive: true });
  } catch (_) {}
}

async function main(): Promise<void> {
  const userId = resolveUserId({ envUserId: process.env.USER_ID, argv: process.argv });
  const paths = getPathsForUser(userId);
  ensureAuthDirForUser(userId);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.setDefaultTimeout(MANUAL_LOGIN_TIMEOUT_MS);

  console.log('Opening Handshake login...');
  await page.goto('https://app.joinhandshake.com/login', { waitUntil: 'load' });
  console.log('Log in in the browser window. Waiting for you to complete login (up to 5 minutes)...');

  await page.waitForFunction(
    () => {
      const host = window.location.hostname.toLowerCase();
      const path = window.location.pathname.toLowerCase();
      const isHandshakeApp = host.includes('joinhandshake.com');
      const isLoginPath = path.includes('login') || path.includes('configure_auth') || path.includes('sign_in');
      return isHandshakeApp && !isLoginPath;
    },
    { timeout: MANUAL_LOGIN_TIMEOUT_MS }
  );

  await new Promise((r) => setTimeout(r, 1500));

  await context.storageState({ path: paths.authState });
  console.log('Session saved to', paths.authState);
  console.log('You can close the browser when done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
