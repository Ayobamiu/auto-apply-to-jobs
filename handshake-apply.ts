/**
 * ATS Dry Run — Handshake: open apply modal, upload 3 PDFs, optionally submit, verify console log.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL || 'http://localhost:8765';
const HANDSHAKE_URL = `${BASE_URL}/handshake.html`;
const FIXTURES = {
  transcript: join(__dirname, 'fixtures', 'Unofficial Academic Transcript .pdf'),
  resume: join(__dirname, 'fixtures', 'sample-resume.pdf'),
  coverLetter: join(__dirname, 'fixtures', 'sample-cover-letter.pdf'),
};

export interface RunHandshakeApplyOptions {
  headless?: boolean;
  stopBeforeSubmit?: boolean;
  keepOpen?: boolean;
}

export async function runHandshakeApply(options: RunHandshakeApplyOptions = {}): Promise<{ success: boolean; message?: string; log?: string }> {
  const { headless = true, stopBeforeSubmit = true, keepOpen = false } = options;
  const submittedLogs: string[] = [];

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('Handshake apply submitted')) submittedLogs.push(text);
  });

  try {
    await page.goto(HANDSHAKE_URL, { waitUntil: 'load' });
    await page.click('#apply-btn');
    await page.waitForSelector('#apply-dialog[aria-hidden="false"]', { state: 'visible', timeout: 5000 });

    await page.setInputFiles('#file-transcript', FIXTURES.transcript);
    await page.setInputFiles('#file-resume', FIXTURES.resume);
    await page.setInputFiles('#file-cover', FIXTURES.coverLetter);

    if (stopBeforeSubmit) {
      return { success: true, message: 'Uploads done; stopped before submit.' };
    }

    await page.click('#submit-application');
    await new Promise((r) => setTimeout(r, 300));

    if (submittedLogs.length === 0) throw new Error('Console log "Handshake apply submitted" was not seen');
    return { success: true, log: submittedLogs[0] };
  } finally {
    if (!keepOpen) await browser.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runHandshakeApply({ stopBeforeSubmit: true, keepOpen: true })
    .then((r) => {
      console.log(r.log != null ? 'Success: ' + r.log : r.message);
    })
    .catch((err) => {
      console.error('Error:', (err as Error).message);
      process.exit(1);
    });
}
