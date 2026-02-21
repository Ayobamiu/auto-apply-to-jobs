/**
 * Real Handshake: load saved session, go to job URL, open apply modal.
 * For each of transcript, resume, cover letter: search by file name and select if found, else upload new.
 * Set SUBMIT_APPLICATION=1 to click Submit after uploads; otherwise stops before submit.
 * Optional: RESUME_PATH, TRANSCRIPT_PATH, COVER_PATH override paths.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { PATHS } from '../../shared/config.js';
import { isJobUploaded, setJobUploaded } from '../../shared/apply-state.js';
import { getJobIdFromUrl, getJobSiteFromUrl, toHandshakeJobDetailsUrl } from '../../shared/job-from-url.js';
import { getJob as getStoredJob } from '../../shared/jobs-store.js';
import { loadProfile } from '../../shared/profile.js';
import { resumeBasename } from '../../shared/filename-slugs.js';
import { attachSection, SECTION_CONFIG } from '../../shared/handshake-attach-helper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getPreferredResumePathForJob(jobUrl) {
  if (!jobUrl) return null;
  const jobId = getJobIdFromUrl(jobUrl);
  const site = getJobSiteFromUrl(jobUrl);
  if (!jobId || !site) return null;
  const job = getStoredJob(site, jobId);
  if (!job) return null;
  try {
    const profile = loadProfile();
    const basename = resumeBasename(profile, job);
    if (!basename) return null;
    const path = join(PATHS.output, `${basename}.pdf`);
    return existsSync(path) ? path : null;
  } catch {
    return null;
  }
}

function getFixtures(jobUrl) {
  const preferredResume = !process.env.RESUME_PATH ? getPreferredResumePathForJob(jobUrl) : null;
  return {
    transcript: process.env.TRANSCRIPT_PATH || join(PATHS.fixtures, 'Unofficial Academic Transcript .pdf'),
    resume: process.env.RESUME_PATH || preferredResume || join(PATHS.fixtures, 'sample-resume.pdf'),
    coverLetter: process.env.COVER_PATH || join(PATHS.fixtures, 'sample-cover-letter.pdf'),
  };
}

function getJobUrl() {
  const raw = process.env.JOB_URL || process.argv[2] || null;
  return raw ? toHandshakeJobDetailsUrl(raw) : null;
}

async function main() {
  const jobUrl = getJobUrl();
  if (!jobUrl) {
    console.error('Provide job URL: JOB_URL=<url> npm run handshake:apply  OR  npm run handshake:apply -- <url>');
    process.exit(1);
  }

  if (!existsSync(PATHS.authState)) {
    console.error('No saved session. Run: npm run handshake:login');
    process.exit(1);
  }

  const alreadyUploaded = isJobUploaded(jobUrl);
  const files = getFixtures(jobUrl);
  const defaultResume = join(PATHS.fixtures, 'sample-resume.pdf');
  if (files.resume !== defaultResume) {
    console.log('Using resume:', files.resume);
  } else {
    console.log('Using fixture resume (no job-specific PDF found). Run pipeline with this URL first to use a tailored resume.');
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: PATHS.authState });
  const page = await context.newPage();

  try {
    await page.goto(jobUrl, { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 2000));

    const url = page.url();
    const host = new URL(url).hostname.toLowerCase();
    const isLoginPage = host.includes('login') || host.includes('sso.') || host.includes('webauth.') || host.includes('idp.');
    if (isLoginPage) {
      console.error('Session expired or not logged in. Run: npm run handshake:login');
      process.exit(1);
    }

    const applyButton = page.getByRole('button', { name: /apply/i }).first();
    const applyLink = page.getByRole('link', { name: /apply/i }).first();
    const buttonText = (await applyButton.textContent().catch(() => null))?.trim() ?? '';
    const linkText = (await applyLink.textContent().catch(() => null))?.trim() ?? '';
    const isExternalApply = /apply\s+externally|apply\s+external/i.test(buttonText) || /apply\s+externally|apply\s+external/i.test(linkText);
    if (isExternalApply) {
      console.error('This job uses "Apply externally" and is not supported. Only in-Handshake apply is supported.');
      process.exit(1);
    }

    const appliedBanner = page.getByText(/Applied on .+/i).first();
    try {
      await appliedBanner.waitFor({ state: 'visible', timeout: 3000 });
      const appliedText = await appliedBanner.textContent();
      console.log('Already applied to this job.', (appliedText || '').trim() || 'Applied on [date]');
      return;
    } catch (_) { }

    const applyBtn = page.getByRole('button', { name: /apply/i }).first();
    await applyBtn.click({ timeout: 15000 }).catch(() =>
      page.getByRole('link', { name: /apply/i }).first().click({ timeout: 5000 })
    );
    await new Promise((r) => setTimeout(r, 1500));

    const applyModal = page.locator('[data-hook="apply-modal-content"]').first();
    await applyModal.waitFor({ state: 'visible', timeout: 15000 }).catch(() =>
      page.getByText('Attach your transcript').first().waitFor({ state: 'visible', timeout: 5000 })
    );

    const doSubmit = process.env.SUBMIT_APPLICATION === '1' || process.env.SUBMIT_APPLICATION === 'true';

    // Remove any pre-populated file chips so we can set our selection
    const removePrePopulated = applyModal.locator('[data-status="positive"]').getByRole('button', { name: 'Close' });
    let closeCount = await removePrePopulated.count();
    while (closeCount > 0) {
      await removePrePopulated.first().click();
      await new Promise((r) => setTimeout(r, 400));
      closeCount = await removePrePopulated.count();
    }

    // For each section present on the form: search by name then select or upload. Skip sections not required by this job.
    const modal = applyModal;
    for (const [key, config] of Object.entries(SECTION_CONFIG)) {
      const filePath = files[key];
      if (!filePath || !existsSync(filePath)) continue;
      try {
        const result = await attachSection(page, modal, {
          ...config,
          filePath,
        });
        console.log(`${key}: ${result === 'selected' ? 'selected existing' : 'uploaded new'}`);
      } catch (err) {
        if (key === 'coverLetter') {
          try {
            const fallback = modal.locator(`input[name="file-Cover"], input[name="file-CoverLetter"]`).first();
            await fallback.setInputFiles(filePath, { timeout: 3000 });
            console.log('coverLetter: uploaded new (fallback)');
          } catch (_) {
            console.log('Skipping cover letter (not required or section not found).');
          }
        } else {
          console.log(`Skipping ${key} (not required or section not found).`);
        }
      }
    }

    if (doSubmit) {
      await new Promise((r) => setTimeout(r, 6000));
      const submitBtn = applyModal.getByRole('button', { name: /submit\s*application/i }).first();
      await submitBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => { });
      await submitBtn.click({ force: true, timeout: 5000 }).catch(() => {
        return page.evaluate(() => {
          const b = document.querySelector('button[type="button"]');
          if (b && /submit/i.test(b.textContent || '')) b.click();
        });
      });
      await new Promise((r) => setTimeout(r, 2000));
      try {
        await page.getByText(/Applied on .+/i).first().waitFor({ state: 'visible', timeout: 20000 });
        console.log('Application submitted successfully.');
      } catch (_) {
        try {
          await page.getByText(/Withdraw application/i).first().waitFor({ state: 'visible', timeout: 5000 });
          console.log('Application submitted successfully.');
        } catch (__) {
          const screenshotDir = join(PATHS.output, 'apply-screenshots');
          mkdirSync(screenshotDir, { recursive: true });
          await page.screenshot({ path: join(screenshotDir, 'after-submit-failed.png') });
          console.error('Submit may have failed. Screenshot saved to output/apply-screenshots/after-submit-failed.png');
        }
      }
      setJobUploaded(jobUrl, {
        resumePath: files.resume,
        submittedAt: new Date().toISOString(),
      });
    } else {
      setJobUploaded(jobUrl, { resumePath: files.resume });
      console.log('Stopped before submit. Set SUBMIT_APPLICATION=1 to submit. Close browser when done.');
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
