/**
 * Real Handshake: load saved session, go to job URL, open apply modal.
 * If state says already uploaded for this job URL: skip upload, show "ready to submit".
 * Else: attach transcript/resume/cover letter, then save state (uploaded, resume path, timestamp).
 * Stops before submit. Job URL from JOB_URL env or first CLI arg.
 * Optional: RESUME_PATH, TRANSCRIPT_PATH, COVER_PATH override fixture paths.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { PATHS } from '../../shared/config.js';
import { isJobUploaded, setJobUploaded } from '../../shared/apply-state.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getFixtures() {
  return {
    transcript: process.env.TRANSCRIPT_PATH || join(PATHS.fixtures, 'sample-transcript.pdf'),
    resume: process.env.RESUME_PATH || join(PATHS.fixtures, 'sample-resume.pdf'),
    coverLetter: process.env.COVER_PATH || join(PATHS.fixtures, 'sample-cover-letter.pdf'),
  };
}

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

  if (!existsSync(PATHS.authState)) {
    console.error('No saved session. Run: npm run handshake:login');
    process.exit(1);
  }

  const alreadyUploaded = isJobUploaded(jobUrl);
  const files = getFixtures();

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: PATHS.authState });
  const page = await context.newPage();

  try {
    await page.goto(jobUrl, { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 2000));

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

    // Detect "Apply externally" — not supported; we only handle in-Handshake apply.
    const applyButton = page.getByRole('button', { name: /apply/i }).first();
    const applyLink = page.getByRole('link', { name: /apply/i }).first();
    const buttonText = (await applyButton.textContent().catch(() => null))?.trim() ?? '';
    const linkText = (await applyLink.textContent().catch(() => null))?.trim() ?? '';
    const isExternalApply = /apply\s+externally|apply\s+external/i.test(buttonText) || /apply\s+externally|apply\s+external/i.test(linkText);
    if (isExternalApply) {
      console.error('This job uses "Apply externally" and is not supported yet. Only in-Handshake apply is supported.');
      process.exit(1);
    }

    const applyBtn = page.getByRole('button', { name: /apply/i }).first();
    await applyBtn.click({ timeout: 15000 }).catch(() => {
      const link = page.getByRole('link', { name: /apply/i }).first();
      return link.click({ timeout: 5000 });
    });
    await new Promise((r) => setTimeout(r, 1500));

    const applyModal = page.locator('[data-hook="apply-modal-content"]').first();
    await applyModal.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {
      return page.getByText('Attach your transcript').first().waitFor({ state: 'visible', timeout: 5000 });
    });

    if (alreadyUploaded) {
      console.log('Already uploaded for this job. Modal open; ready to submit when you are.');
      console.log('Stopped before submit. Close browser when done.');
      return;
    }

    const removePrePopulated = applyModal.locator('[data-status="positive"]').getByRole('button', { name: 'Close' });
    let closeCount = await removePrePopulated.count();
    while (closeCount > 0) {
      await removePrePopulated.first().click();
      await new Promise((r) => setTimeout(r, 400));
      closeCount = await removePrePopulated.count();
    }

    const transcriptInput = page.locator('input[name="file-Transcript"]');
    const resumeInput = page.locator('input[name="file-Resume"]');
    const coverInput = page.locator('input[name="file-CoverLetter"]');

    let filesToUpload = 0;
    if (await transcriptInput.count() > 0) {
      await transcriptInput.setInputFiles(files.transcript);
      filesToUpload++;
    }
    if (await resumeInput.count() > 0) {
      await resumeInput.setInputFiles(files.resume);
      filesToUpload++;
    }
    if (await coverInput.count() > 0) {
      await coverInput.setInputFiles(files.coverLetter);
      filesToUpload++;
    }

    if (filesToUpload > 0) {
      await page.waitForFunction(
        (expected) => {
          const chips = document.querySelectorAll('[data-hook="apply-modal-content"] [data-status="positive"]');
          return chips.length >= expected;
        },
        filesToUpload,
        { timeout: 30000 }
      );
      setJobUploaded(jobUrl, { resumePath: files.resume });
      console.log('Uploads ready for submission. State saved (this job marked uploaded).');
    }

    console.log('Stopped before submit. Close browser when done.');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

main();
