/**
 * Real Handshake: open login page, wait for manual login, save session to .auth/handshake-state.json.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { mkdirSync } from 'fs';
import { PATHS } from '../../shared/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function ensureAuthDir(): void {
  try {
    mkdirSync(PATHS.auth, { recursive: true });
  } catch (_) {}
}

async function main(): Promise<void> {
  ensureAuthDir();

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  const FIVE_MINUTES_MS = 5 * 60 * 1000;
  page.setDefaultTimeout(FIVE_MINUTES_MS);

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
    { timeout: FIVE_MINUTES_MS }
  );

  await new Promise((r) => setTimeout(r, 1500));

  await context.storageState({ path: PATHS.authState });
  console.log('Session saved to .auth/handshake-state.json');
  console.log('You can close the browser when done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
