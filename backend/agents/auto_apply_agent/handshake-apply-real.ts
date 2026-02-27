/**
 * Real Handshake: load saved session, go to job URL, open apply modal.
 * Set SUBMIT_APPLICATION=1 to click Submit after uploads; otherwise stops before submit.
 */
import 'dotenv/config';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { PATHS, resolveUserId } from '../../shared/config.js';
import { setApplicationState } from '../../data/apply-state.js';
import { setUserJobState, toJobRef } from '../../data/user-job-state.js';
import { getJobIdFromUrl, getJobSiteFromUrl, toHandshakeJobDetailsUrl } from '../../shared/job-from-url.js';
import { getJob, updateJob } from '../../data/jobs.js';
import { getProfile } from '../../data/profile.js';
import { getResumeForJob } from '../../data/job-artifacts.js';
import { ensureResumePdfFromDb } from '../resume_generator_agent/export-pdf.js';
import { ensureCoverLetterPdfFromDb } from '../resume_generator_agent/cover-letter.js';
import { getApplyFormSchema, saveApplyFormSchema } from '../../data/apply-forms.js';
import { attachSection, getPresentSectionConfigs, type PresentSectionConfig } from '../../shared/handshake-attach-helper.js';
import { captureApplyFormSchema } from '../../shared/apply-form-capture.js';
import { AppError, CODES } from '../../shared/errors.js';
import { getHandshakeSessionPath } from '../../data/handshake-session.js';
import { checkSessionValid } from '../../shared/session-check.js';
import { launchBrowser } from '../../shared/browser.js';
import {
  APPLY_HEADED,
  APPLY_BUTTON_TIMEOUT_MS,
  APPLY_MODAL_TIMEOUT_MS,
  SUBMIT_CONFIRM_TIMEOUT_MS,
  POST_NAVIGATE_DELAY_MS,
  POST_APPLY_CLICK_DELAY_MS,
  PRE_SUBMIT_DELAY_MS,
  POST_SUBMIT_DELAY_MS,
  UPLOAD_COMPLETE_TIMEOUT_MS,
  UPLOAD_COMPLETE_POLL_MS,
  SUBMIT_MAX_RETRIES,
  SUBMIT_RETRY_DELAY_MS,
} from '../../shared/constants.js';
import { preflightForApply } from '../../shared/preflight.js';
import { getApplicationStatus } from '../job_scraper_agent/index.js';
import { startPhase } from '../../shared/timing.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

import type { RunHandshakeApplyOptions, RunHandshakeApplyResult } from '../../shared/types.js';
export type { RunHandshakeApplyOptions, RunHandshakeApplyResult } from '../../shared/types.js';

async function getPreferredResumePathForJob(jobUrl: string, userId: string): Promise<string | null> {
  const jobId = getJobIdFromUrl(jobUrl);
  const site = getJobSiteFromUrl(jobUrl);
  if (!jobId || !site) return null;
  const job = await getJob(site, jobId);
  if (!job) return null;
  try {
    const existing = await getResumeForJob(userId, site, jobId);
    if (existing) {
      const { resumePath } = await ensureResumePdfFromDb(userId, site, jobId, { profile: await getProfile(userId), job });
      return resumePath;
    }
    return null;
  } catch {
    return null;
  }
}

async function getFixtures(
  jobUrl: string,
  options: { resumePath?: string; transcriptPath?: string; coverPath?: string; userId?: string } = {}
): Promise<{ transcript: string; resume: string; coverLetter: string }> {
  const userId = options.userId ?? 'default';
  const jobId = getJobIdFromUrl(jobUrl);
  const site = getJobSiteFromUrl(jobUrl);

  let preferredResume: string | null = null;
  if (!(options.resumePath ?? process.env.RESUME_PATH)) {
    preferredResume = await getPreferredResumePathForJob(jobUrl, userId);
  }

  let preferredCover: string = options.coverPath ?? process.env.COVER_PATH ?? '';
  if (!preferredCover && site && jobId) {
    try {
      const { getCoverLetterForJob } = await import('../../data/job-artifacts.js');
      const cover = await getCoverLetterForJob(userId, site, jobId);
      if (cover) {
        const { coverPath } = await ensureCoverLetterPdfFromDb(userId, site, jobId);
        preferredCover = coverPath;
      }
    } catch (_) {}
  }

  return {
    transcript:
      options.transcriptPath ??
      process.env.TRANSCRIPT_PATH ??
      join(PATHS.fixtures, 'Unofficial Academic Transcript .pdf'),
    resume:
      options.resumePath ??
      process.env.RESUME_PATH ??
      preferredResume ??
      join(PATHS.fixtures, 'sample-resume.pdf'),
    coverLetter: preferredCover,
  };
}

function getJobUrl(): string | null {
  const raw = process.env.JOB_URL || process.argv[2] || null;
  return raw ? toHandshakeJobDetailsUrl(raw as string) : null;
}

export async function runHandshakeApply(jobUrl: string, options: RunHandshakeApplyOptions = {}): Promise<RunHandshakeApplyResult> {
  const userId = options.userId ?? resolveUserId({ envUserId: process.env.USER_ID, argv: process.argv });

  const endPreflight = startPhase('Apply: preflight');
  await preflightForApply(jobUrl, userId);
  endPreflight();

  const endAlready = startPhase('Apply: check already applied (store)');
  const { applicationSubmitted } = await getApplicationStatus(jobUrl, { fromStoreOnly: true, userId });
  endAlready();
  if (applicationSubmitted) {
    return { applied: true, skipped: true };
  }

  const endSession = startPhase('Apply: session check (headless browser)');
  const session = await checkSessionValid(userId);
  endSession();
  if (!session.valid) {
    if (session.reason === 'no_session') throw new AppError(CODES.NO_SESSION);
    throw new AppError(CODES.SESSION_EXPIRED);
  }

  const endFixtures = startPhase('Apply: resolve fixture paths');
  const files = await getFixtures(jobUrl, {
    resumePath: options.resumePath,
    transcriptPath: options.transcriptPath,
    coverPath: options.coverPath,
    userId,
  });
  endFixtures();
  const defaultResume = join(PATHS.fixtures, 'sample-resume.pdf');
  if (files.resume !== defaultResume) {
    console.log('Using resume:', files.resume);
  } else {
    console.log('Using fixture resume (no job-specific PDF found). Run pipeline with this URL first to use a tailored resume.');
  }

  const endLaunch = startPhase('Apply: browser launch');
  const storagePath = await getHandshakeSessionPath(userId);
  if (!storagePath) {
    throw new AppError(CODES.NO_SESSION);
  }
  const browser = await launchBrowser({ headless: !APPLY_HEADED });
  const context = await browser.newContext({ storageState: storagePath });
  const page = await context.newPage();
  endLaunch();

  try {
    const endGoto = startPhase('Apply: goto job page + 2s settle');
    await page.goto(jobUrl, { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, POST_NAVIGATE_DELAY_MS));
    endGoto();

    const url = page.url();
    const host = new URL(url).hostname.toLowerCase();
    const isLoginPage =
      host.includes('login') || host.includes('sso.') || host.includes('webauth.') || host.includes('idp.');
    if (isLoginPage) {
      throw new AppError(CODES.SESSION_EXPIRED);
    }

    const applyButton = page.getByRole('button', { name: /apply/i }).first();
    const applyLink = page.getByRole('link', { name: /apply/i }).first();
    const buttonText = (await applyButton.textContent().catch(() => null))?.trim() ?? '';
    const linkText = (await applyLink.textContent().catch(() => null))?.trim() ?? '';
    const isExternalApply =
      /apply\s+externally|apply\s+external/i.test(buttonText) || /apply\s+externally|apply\s+external/i.test(linkText);
    if (isExternalApply) {
      throw new AppError(CODES.APPLY_EXTERNALLY);
    }

    const appliedBanner = page.getByText(/Applied on .+/i).first();
    try {
      await appliedBanner.waitFor({ state: 'visible', timeout: 3000 });
      const appliedText = await appliedBanner.textContent();
      console.log('Already applied to this job.', (appliedText || '').trim() || 'Applied on [date]');
      return { applied: true, skipped: true };
    } catch (_) {}

    const endClickApply = startPhase('Apply: click Apply button + 1.5s');
    const applyBtn = page.getByRole('button', { name: /apply/i }).first();
    await applyBtn.click({ timeout: APPLY_BUTTON_TIMEOUT_MS }).catch(() =>
      page.getByRole('link', { name: /apply/i }).first().click({ timeout: 5000 })
    );
    await new Promise((r) => setTimeout(r, POST_APPLY_CLICK_DELAY_MS));
    endClickApply();

    const endModal = startPhase('Apply: wait for apply modal');
    const applyModal = page.locator('[data-hook="apply-modal-content"]').first();
    await applyModal.waitFor({ state: 'visible', timeout: APPLY_MODAL_TIMEOUT_MS }).catch(() =>
      page.getByText('Attach your transcript').first().waitFor({ state: 'visible', timeout: 5000 })
    );
    endModal();

    const jobId = getJobIdFromUrl(jobUrl);
    let schema: Record<string, unknown>;
    try {
      schema = (await captureApplyFormSchema(page, applyModal)) as unknown as Record<string, unknown>;
    } catch (_) {
      schema = { sections: [], capturedAt: new Date().toISOString() };
    }
    const saved = jobId ? getApplyFormSchema(jobId) : null;

    const doSubmit =
      options.submit !== undefined
        ? options.submit
        : process.env.SUBMIT_APPLICATION === '1' || process.env.SUBMIT_APPLICATION === 'true';

    const removePrePopulated = applyModal.locator('[data-status="positive"]').getByRole('button', { name: 'Close' });
    let closeCount = await removePrePopulated.count();
    while (closeCount > 0) {
      await removePrePopulated.first().click();
      await new Promise((r) => setTimeout(r, 400));
      closeCount = await removePrePopulated.count();
    }

    let presentSections: PresentSectionConfig[];
    const savedSections =
      saved && Array.isArray((saved as { presentSections?: unknown }).presentSections)
        ? ((saved as { presentSections: PresentSectionConfig[] }).presentSections)
        : null;
    const usedCachedPresentSections = savedSections != null && savedSections.length > 0;
    if (usedCachedPresentSections) {
      presentSections = savedSections;
      console.log('Using saved form sections:', presentSections.map((c) => c.key).join(', '));
    } else {
      presentSections = await getPresentSectionConfigs(page, applyModal);
    }
    if (jobId) {
      saveApplyFormSchema(jobId, { ...schema, presentSections });
    }

    const endAttach = startPhase('Apply: attach transcript + resume + cover');
    const modal = applyModal;
    const toAttach = presentSections.filter((c) => {
      const path = files[c.key];
      return path && existsSync(path);
    });
    const toSkip = presentSections.filter((c) => !files[c.key] || !existsSync(files[c.key]));
    if (toAttach.length) console.log('Will attach:', toAttach.map((c) => c.key).join(', '));
    if (toSkip.length) console.log('Skipping (no file or not on form):', toSkip.map((c) => c.key).join(', '));

    for (const config of presentSections) {
      const filePath = files[config.key];
      if (!filePath || !existsSync(filePath)) continue;
      try {
        const result = await attachSection(page, modal, { ...config, filePath });
        console.log(`${config.key}: ${result === 'selected' ? 'selected existing' : 'uploaded new'}`);
      } catch {
        if (config.key === 'coverLetter') {
          try {
            const fallback = modal.locator(`input[name="file-Cover"], input[name="file-CoverLetter"]`).first();
            await fallback.setInputFiles(filePath, { timeout: 3000 });
            console.log('coverLetter: uploaded new (fallback)');
          } catch (_) {
            console.log('Skipping cover letter (not required or section not found).');
          }
        } else {
          if (usedCachedPresentSections && jobId) {
            const fresh = await getPresentSectionConfigs(page, applyModal);
            const current = getApplyFormSchema(jobId);
            if (current) saveApplyFormSchema(jobId, { ...current, presentSections: fresh });
            const retryConfig = fresh.find((f) => f.key === config.key);
            if (retryConfig) {
              try {
                await attachSection(page, modal, { ...retryConfig, filePath });
                console.log(`${config.key}: uploaded new (after re-detect)`);
              } catch (_) {
                console.log(`Skipping ${config.key} (not required or section not found).`);
              }
            } else {
              console.log(`Skipping ${config.key} (not required or section not found).`);
            }
          } else {
            console.log(`Skipping ${config.key} (not required or section not found).`);
          }
        }
      }
    }
    endAttach();

    let applied = false;
    if (doSubmit) {
      const endSubmit = startPhase('Apply: wait uploads + submit + confirm');

      const expectedUploads = toAttach.length;
      if (expectedUploads > 0) {
        console.log(`Waiting for ${expectedUploads} upload(s) to complete...`);
        const deadline = Date.now() + UPLOAD_COMPLETE_TIMEOUT_MS;
        while (Date.now() < deadline) {
          const completedCount = await applyModal.locator('[data-status="positive"]').count();
          if (completedCount >= expectedUploads) {
            console.log(`All ${expectedUploads} upload(s) confirmed (green checkmarks).`);
            break;
          }
          const validationError = await applyModal.getByText(/please enter a valid|make sure all required/i).first().isVisible().catch(() => false);
          if (validationError) {
            console.log(`Uploads in progress (${completedCount}/${expectedUploads}), validation message visible — waiting...`);
          }
          await new Promise((r) => setTimeout(r, UPLOAD_COMPLETE_POLL_MS));
        }
      }

      await new Promise((r) => setTimeout(r, PRE_SUBMIT_DELAY_MS));

      let submitted = false;
      for (let attempt = 1; attempt <= SUBMIT_MAX_RETRIES; attempt++) {
        const submitBtn = page.getByRole('button', { name: /submit\s*application/i }).first();
        await submitBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

        const isDisabled = await submitBtn.isDisabled().catch(() => false);
        if (isDisabled && attempt < SUBMIT_MAX_RETRIES) {
          console.log(`Submit button disabled (attempt ${attempt}/${SUBMIT_MAX_RETRIES}). Validation may be pending — waiting...`);
          await new Promise((r) => setTimeout(r, SUBMIT_RETRY_DELAY_MS));
          continue;
        }

        console.log(`Clicking Submit Application (attempt ${attempt}/${SUBMIT_MAX_RETRIES})...`);
        await submitBtn.click({ force: true, timeout: 5000 }).catch(() =>
          page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const sub = buttons.find((b) => /submit/i.test(b.textContent || ''));
            if (sub) (sub as HTMLElement).click();
          })
        );

        await new Promise((r) => setTimeout(r, POST_SUBMIT_DELAY_MS));

        try {
          await page.getByText(/Applied on .+/i).first().waitFor({ state: 'visible', timeout: SUBMIT_CONFIRM_TIMEOUT_MS });
          console.log('Application submitted successfully.');
          submitted = true;
          break;
        } catch (_) {
          try {
            await page.getByText(/Withdraw application/i).first().waitFor({ state: 'visible', timeout: 5000 });
            console.log('Application submitted successfully.');
            submitted = true;
            break;
          } catch (_) {
            if (attempt < SUBMIT_MAX_RETRIES) {
              console.log(`Submit not confirmed (attempt ${attempt}/${SUBMIT_MAX_RETRIES}). Retrying in ${SUBMIT_RETRY_DELAY_MS / 1000}s...`);
              await new Promise((r) => setTimeout(r, SUBMIT_RETRY_DELAY_MS));
            } else {
              const screenshotDir = PATHS.applyScreenshots ?? join(PATHS.output, 'apply-screenshots');
              mkdirSync(screenshotDir, { recursive: true });
              await page.screenshot({ path: join(screenshotDir, 'after-submit-failed.png') });
              console.error(`Submit failed after ${SUBMIT_MAX_RETRIES} attempts. Screenshot saved.`);
            }
          }
        }
      }

      const submittedAt = new Date().toISOString();
      await setApplicationState(jobUrl, { resumePath: files.resume, submittedAt }, userId);
      if (submitted) {
        applied = true;
        const jid = getJobIdFromUrl(jobUrl);
        const site = getJobSiteFromUrl(jobUrl);
        if (jid && site) {
          const jobRef = toJobRef(site, jid);
          await setUserJobState(userId, jobRef, { applicationSubmitted: true, appliedAt: submittedAt });
          const stored = await getJob(site, jid);
          await updateJob(site, jid, { ...(stored || { url: jobUrl }) });
        }
      }
      endSubmit();
    } else {
      await setApplicationState(jobUrl, { resumePath: files.resume }, userId);
      console.log('Stopped before submit. Set SUBMIT_APPLICATION=1 to submit. Close browser when done.');
    }
    return { applied };
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const jobUrl = getJobUrl();
  if (!jobUrl) {
    throw new AppError(CODES.NO_JOB_URL);
  }
  const userId = resolveUserId({ envUserId: process.env.USER_ID, argv: process.argv });
  await runHandshakeApply(jobUrl, {
    submit: process.env.SUBMIT_APPLICATION === '1' || process.env.SUBMIT_APPLICATION === 'true',
    resumePath: process.env.RESUME_PATH,
    transcriptPath: process.env.TRANSCRIPT_PATH,
    coverPath: process.env.COVER_PATH,
    userId,
  });
}

const isEntry = process.argv[1] === fileURLToPath(import.meta.url);
if (isEntry) {
  main()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
        console.error((err as { message: string }).message);
      } else {
        console.error(err);
      }
      process.exit(1);
    });
}
