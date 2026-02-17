/**
 * Real Handshake: load saved session, go to job URL, open apply modal, attach transcript/resume/cover letter.
 * Stops before submit and keeps browser open for inspection.
 * Job URL from JOB_URL env or first CLI arg.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(__dirname, '.auth', 'handshake-state.json');
const FIXTURES = {
  transcript: join(__dirname, 'fixtures', 'sample-transcript.pdf'),
  resume: join(__dirname, 'fixtures', 'sample-resume.pdf'),
  coverLetter: join(__dirname, 'fixtures', 'sample-cover-letter.pdf'),
};

function getJobUrl() {
  const env = process.env.JOB_URL;
  if (env) return env;
  const arg = process.argv[2];
  if (arg) return arg;
  return null;
}

async function main() {
  const jobUrl = getJobUrl();
  if (!jobUrl) {
    console.error('Provide job URL: JOB_URL=<url> npm run handshake:apply  OR  node handshake-apply-real.js <url>');
    process.exit(1);
  }

  if (!existsSync(STATE_PATH)) {
    console.error('No saved session. Run: npm run handshake:login');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: STATE_PATH });
  const page = await context.newPage();

  try {
    await page.goto(jobUrl, { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 2000));

    // If session expired, Handshake redirects to login — detect and exit with a clear message
    const url = page.url();
    const path = new URL(url).pathname.toLowerCase();
    const host = new URL(url).hostname.toLowerCase();
    const isLoginPage =
      path.includes('login') ||
      path.includes('configure_auth') ||
      path.includes('sign_in') ||
      host.includes('webauth.') ||
      host.includes('idp.');
    if (isLoginPage) {
      console.error('Session expired or not logged in. Run: npm run handshake:login');
      process.exit(1);
    }

    // Click Apply: resilient selector for real Handshake
    const applyBtn = page.getByRole('button', { name: /apply/i }).first();
    await applyBtn.click({ timeout: 15000 }).catch(() => {
      const link = page.getByRole('link', { name: /apply/i }).first();
      return link.click({ timeout: 5000 });
    });
    await new Promise((r) => setTimeout(r, 1500));

    // Wait for the apply modal content to be visible (avoid matching hidden dialogs like "Get the app")
    const applyModal = page.locator('[data-hook="apply-modal-content"]').first();
    await applyModal.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {
      return page.getByText('Attach your transcript').first().waitFor({ state: 'visible', timeout: 5000 });
    });

    // Remove any pre-populated transcript/resume/cover so we can upload new ones.
    // Handshake shows uploaded files as [data-status="positive"] with a Close button.
    const removePrePopulated = applyModal.locator('[data-status="positive"]').getByRole('button', { name: 'Close' });
    let closeCount = await removePrePopulated.count();
    while (closeCount > 0) {
      await removePrePopulated.first().click();
      await new Promise((r) => setTimeout(r, 400));
      closeCount = await removePrePopulated.count();
    }

    // Attach files: real Handshake uses name="file-Transcript", "file-Resume", and optionally cover
    const transcriptInput = page.locator('input[name="file-Transcript"]');
    const resumeInput = page.locator('input[name="file-Resume"]');
    const coverInput = page.locator('input[name="file-CoverLetter"]');

    let filesToUpload = 0;
    if (await transcriptInput.count() > 0) {
      await transcriptInput.setInputFiles(FIXTURES.transcript);
      filesToUpload++;
    }
    if (await resumeInput.count() > 0) {
      await resumeInput.setInputFiles(FIXTURES.resume);
      filesToUpload++;
    }
    if (await coverInput.count() > 0) {
      await coverInput.setInputFiles(FIXTURES.coverLetter);
      filesToUpload++;
    }

    // Wait until Handshake shows our uploads as ready: [data-status="positive"] chips appear for each file
    if (filesToUpload > 0) {
      await page.waitForFunction(
        (expected) => {
          const chips = document.querySelectorAll('[data-hook="apply-modal-content"] [data-status="positive"]');
          return chips.length >= expected;
        },
        filesToUpload,
        { timeout: 30000 }
      );
      console.log('Uploads ready for submission.');
    }

    console.log('Stopped before submit. Close browser when done.');
    // Keep browser open; do not click Submit
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

main();
