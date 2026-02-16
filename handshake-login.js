/**
 * Real Handshake: open login page, wait for manual login, save session to .auth/handshake-state.json.
 * Run once (or when session expires). No credentials in code; you log in in the browser.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGIN_URL = 'https://app.joinhandshake.com/login';
const STATE_PATH = join(__dirname, '.auth', 'handshake-state.json');

function ensureAuthDir() {
  try {
    mkdirSync(join(__dirname, '.auth'), { recursive: true });
  } catch (_) { }
}

async function main() {
  ensureAuthDir();

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  const FIVE_MINUTES_MS = 5 * 60 * 1000;
  page.setDefaultTimeout(FIVE_MINUTES_MS);

  console.log('Opening Handshake login...');
  await page.goto(LOGIN_URL, { waitUntil: 'load' });
  console.log('Log in in the browser window. Waiting for you to complete login (up to 5 minutes)...');

  // Reliable "logged in" check from recorded flow: after login you land on
  // e.g. https://wmich.joinhandshake.com/explore. So: on *.joinhandshake.com
  // with a path that is not login/configure_auth/sign_in.
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

  // Short delay so the session is fully established
  await new Promise((r) => setTimeout(r, 1500));

  await context.storageState({ path: STATE_PATH });
  console.log('Session saved to .auth/handshake-state.json');
  console.log('You can close the browser when done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
