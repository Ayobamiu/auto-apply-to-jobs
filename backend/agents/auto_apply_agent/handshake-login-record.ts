/**
 * Record all main-frame navigations during Handshake login.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { getPathsForUser, resolveUserId } from '../../shared/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGIN_URL = 'https://app.joinhandshake.com/login';

interface LogEntry {
  url: string;
  timestamp: string;
  label: string;
}

function ensureAuthDir(userId: string): void {
  const { navigationLog } = getPathsForUser(userId);
  try {
    mkdirSync(dirname(navigationLog), { recursive: true });
  } catch (_) {}
}

function writeLogToFile(entries: LogEntry[], userId: string): void {
  const { navigationLog } = getPathsForUser(userId);
  mkdirSync(dirname(navigationLog), { recursive: true });
  writeFileSync(navigationLog, JSON.stringify(entries, null, 2), 'utf8');
}

function writeLog(entries: LogEntry[], userId: string): void {
  writeLogToFile(entries, userId);
  console.log('Wrote', entries.length, 'entries to', getPathsForUser(userId).navigationLog);
}

async function main(): Promise<void> {
  const userId = resolveUserId({ envUserId: process.env.USER_ID, argv: process.argv });
  ensureAuthDir(userId);
  const entries: LogEntry[] = [];

  function record(url: string, label = 'navigate'): void {
    const entry = { url, timestamp: new Date().toISOString(), label };
    entries.push(entry);
    console.log(`[${entries.length}] ${label}: ${url}`);
    writeLogToFile(entries, userId);
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

  const saveAndExit = (): void => {
    writeLog(entries, userId);
    process.exit(0);
  };

  process.on('SIGINT', saveAndExit);
  process.on('SIGTERM', saveAndExit);
  browser.on('disconnected', () => {
    writeLog(entries, userId);
    process.exit(0);
  });

  console.log('Opening Handshake login. Log in in the browser.');
  console.log('Every navigation will be logged. Close the browser when you are fully logged in.');
  await page.goto(LOGIN_URL, { waitUntil: 'load' });
  record(page.url(), 'initial');

  await new Promise(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
