/**
 * Real Handshake: load saved session, go to job URL, open apply modal.
 * Set SUBMIT_APPLICATION=1 to click Submit after uploads; otherwise stops before submit.
 */
import 'dotenv/config';
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { PATHS } from '../../shared/config.js';
import { setApplicationState } from '../../data/apply-state.js';
import { getJobIdFromUrl, getJobSiteFromUrl, toHandshakeJobDetailsUrl } from '../../shared/job-from-url.js';
import { getJob, updateJob } from '../../data/jobs.js';
import { getProfile } from '../../data/profile.js';
import { resumeBasename } from '../../shared/filename-slugs.js';
import { getResumePathsForJob } from '../../data/resumes.js';
import { saveApplyFormSchema } from '../../data/apply-forms.js';
import { attachSection, SECTION_CONFIG } from '../../shared/handshake-attach-helper.js';
import { captureApplyFormSchema } from '../../shared/apply-form-capture.js';
import { AppError, CODES } from '../../shared/errors.js';
import { checkSessionValid } from '../../shared/session-check.js';
import { preflightForApply } from '../../shared/preflight.js';
import { getApplicationStatus } from '../job_scraper_agent/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface RunHandshakeApplyOptions {
  submit?: boolean;
  resumePath?: string;
  transcriptPath?: string;
  coverPath?: string;
}

export interface RunHandshakeApplyResult {
  applied: boolean;
  skipped?: boolean;
}

async function getPreferredResumePathForJob(jobUrl: string): Promise<string | null> {
  const jobId = getJobIdFromUrl(jobUrl);
  const site = getJobSiteFromUrl(jobUrl);
  if (!jobId || !site) return null;
  const job = getJob(site, jobId);
  if (!job) return null;
  try {
    const { jsonPath, pdfPath } = getResumePathsForJob(site, jobId);
    if (job.resumeBasename) {
      if (existsSync(pdfPath)) return pdfPath;
      if (existsSync(jsonPath)) {
        const { ensureResumePdfFromJsonFile } = await import('../resume_generator_agent/export-pdf.js');
        const { resumePath } = ensureResumePdfFromJsonFile(jsonPath, { outputDir: PATHS.resumes });
        return resumePath;
      }
      return null;
    }
    const profile = getProfile();
    const basename = resumeBasename(profile, job);
    if (!basename) return null;
    const path = join(PATHS.resumes, `${basename}.pdf`);
    return existsSync(path) ? path : null;
  } catch {
    return null;
  }
}

async function getFixtures(
  jobUrl: string,
  options: { resumePath?: string; transcriptPath?: string; coverPath?: string } = {}
): Promise<{ transcript: string; resume: string; coverLetter: string }> {
  const preferredResume =
    !(options.resumePath ?? process.env.RESUME_PATH) ? await getPreferredResumePathForJob(jobUrl) : null;
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
    coverLetter: options.coverPath ?? process.env.COVER_PATH ?? join(PATHS.fixtures, 'sample-cover-letter.pdf'),
  };
}

function getJobUrl(): string | null {
  const raw = process.env.JOB_URL || process.argv[2] || null;
  return raw ? toHandshakeJobDetailsUrl(raw as string) : null;
}

export async function runHandshakeApply(jobUrl: string, options: RunHandshakeApplyOptions = {}): Promise<RunHandshakeApplyResult> {
  preflightForApply(jobUrl);

  const { applicationSubmitted } = await getApplicationStatus(jobUrl, { fromStoreOnly: true });
  if (applicationSubmitted) {
    return { applied: true, skipped: true };
  }

  const session = await checkSessionValid();
  if (!session.valid) {
    if (session.reason === 'no_session') throw new AppError(CODES.NO_SESSION);
    throw new AppError(CODES.SESSION_EXPIRED);
  }

  const files = await getFixtures(jobUrl, {
    resumePath: options.resumePath,
    transcriptPath: options.transcriptPath,
    coverPath: options.coverPath,
  });
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

    const applyBtn = page.getByRole('button', { name: /apply/i }).first();
    await applyBtn.click({ timeout: 15000 }).catch(() =>
      page.getByRole('link', { name: /apply/i }).first().click({ timeout: 5000 })
    );
    await new Promise((r) => setTimeout(r, 1500));

    const applyModal = page.locator('[data-hook="apply-modal-content"]').first();
    await applyModal.waitFor({ state: 'visible', timeout: 15000 }).catch(() =>
      page.getByText('Attach your transcript').first().waitFor({ state: 'visible', timeout: 5000 })
    );

    const jobId = getJobIdFromUrl(jobUrl);
    if (jobId) {
      try {
        const schema = await captureApplyFormSchema(page, applyModal);
        saveApplyFormSchema(jobId, schema as unknown as Record<string, unknown>);
      } catch (_) {}
    }

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

    const modal = applyModal;
    for (const [key, config] of Object.entries(SECTION_CONFIG)) {
      const filePath = files[key as keyof typeof files];
      if (!filePath || !existsSync(filePath)) continue;
      try {
        const result = await attachSection(page, modal, { ...config, filePath });
        console.log(`${key}: ${result === 'selected' ? 'selected existing' : 'uploaded new'}`);
      } catch {
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

    let applied = false;
    if (doSubmit) {
      await new Promise((r) => setTimeout(r, 6000));
      const submitBtn = applyModal.getByRole('button', { name: /submit\s*application/i }).first();
      await submitBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
      await submitBtn.click({ force: true, timeout: 5000 }).catch(() =>
        page.evaluate(() => {
          const b = document.querySelector('button[type="button"]');
          if (b && /submit/i.test(b.textContent || '')) (b as HTMLElement).click();
        })
      );
      await new Promise((r) => setTimeout(r, 2000));
      let submitted = false;
      try {
        await page.getByText(/Applied on .+/i).first().waitFor({ state: 'visible', timeout: 20000 });
        console.log('Application submitted successfully.');
        submitted = true;
      } catch (_) {
        try {
          await page.getByText(/Withdraw application/i).first().waitFor({ state: 'visible', timeout: 5000 });
          console.log('Application submitted successfully.');
          submitted = true;
        } catch (_) {
          const screenshotDir = PATHS.applyScreenshots ?? join(PATHS.output, 'apply-screenshots');
          mkdirSync(screenshotDir, { recursive: true });
          await page.screenshot({ path: join(screenshotDir, 'after-submit-failed.png') });
          console.error('Submit may have failed. Screenshot saved to output/apply-screenshots/after-submit-failed.png');
        }
      }
      const submittedAt = new Date().toISOString();
      setApplicationState(jobUrl, { resumePath: files.resume, submittedAt });
      if (submitted) {
        applied = true;
        const jid = getJobIdFromUrl(jobUrl);
        const site = getJobSiteFromUrl(jobUrl);
        if (jid && site) {
          const stored = getJob(site, jid);
          updateJob(site, jid, {
            ...(stored || { url: jobUrl }),
            applicationSubmitted: true,
            appliedAt: submittedAt,
          });
        }
      }
    } else {
      setApplicationState(jobUrl, { resumePath: files.resume });
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
  await runHandshakeApply(jobUrl, {
    submit: process.env.SUBMIT_APPLICATION === '1' || process.env.SUBMIT_APPLICATION === 'true',
    resumePath: process.env.RESUME_PATH,
    transcriptPath: process.env.TRANSCRIPT_PATH,
    coverPath: process.env.COVER_PATH,
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
