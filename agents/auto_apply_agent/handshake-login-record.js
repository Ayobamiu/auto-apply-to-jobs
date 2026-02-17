/**
 * Record all main-frame navigations during Handshake login.
 * Run this, log in manually in the browser, then close the browser window.
 * URLs are written to .auth/navigation-log.json.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { PATHS } from '../../shared/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGIN_URL = 'https://app.joinhandshake.com/login';

function ensureAuthDir() {
  try {
    mkdirSync(PATHS.auth, { recursive: true });
  } catch (_) { }
}

function writeLogToFile(entries) {
  ensureAuthDir();
  writeFileSync(PATHS.navigationLog, JSON.stringify(entries, null, 2), 'utf8');
}

function writeLog(entries) {
  writeLogToFile(entries);
  console.log('Wrote', entries.length, 'entries to', PATHS.navigationLog);
}

async function main() {
  ensureAuthDir();
  const entries = [];

  function record(url, label = 'navigate') {
    const entry = { url, timestamp: new Date().toISOString(), label };
    entries.push(entry);
    console.log(`[${entries.length}] ${label}: ${url}`);
    writeLogToFile(entries);
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) record(frame.url(), 'framenavigated');
  });

  page.on('load', () => {
    const url = page.url();
    if (entries.length === 0 || entries[entries.length - 1].url !== url) {
      record(url, 'load');
    }
  });

  const saveAndExit = () => {
    writeLog(entries);
    process.exit(0);
  };

  process.on('SIGINT', saveAndExit);
  process.on('SIGTERM', saveAndExit);
  browser.on('disconnected', () => {
    writeLog(entries);
    process.exit(0);
  });

  console.log('Opening Handshake login. Log in in the browser.');
  console.log('Every navigation will be logged. Close the browser when you are fully logged in.');
  await page.goto(LOGIN_URL, { waitUntil: 'load' });
  record(page.url(), 'initial');

  await new Promise(() => { });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
