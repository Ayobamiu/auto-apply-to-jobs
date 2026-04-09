/**
 * Unified Handshake handler: form extraction → file upload → form fill → submit.
 * Mirrors the Greenhouse handler pattern (greenhouse/apply.ts).
 *
 * Two entry points used by the pipeline:
 * - extractHandshakeJobForm:  browser → detect sections → extract fields → classify → save
 * - runHandshakeApply:        browser → upload files → fill fields → submit
 *
 * This replaces the old three-file approach (probe-apply-modal + apply-form-capture +
 * handshake-apply-real) and eliminates the separate checkSessionValid browser launch.
 */
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { Page, Locator } from 'playwright';
import { launchBrowser } from '../shared/browser.js';
import { getHandshakeSessionPath } from '../data/handshake-session.js';
import {
  getJobIdFromUrl,
  getJobSiteFromUrl,
  toHandshakeJobDetailsUrl,
} from '../shared/job-from-url.js';
import { toJobRef, setUserJobState } from '../data/user-job-state.js';
import {
  getPresentSectionConfigs,
  attachSection,
  type PresentSectionConfig,
} from '../shared/handshake-attach-helper.js';
import { extractHandshakeForm } from '../shared/form-extraction/handshake-extractor.js';
import { classifyAllFields } from '../shared/form-extraction/field-classifier.js';
import { generateAnswers } from '../shared/form-extraction/answer-generator.js';
import { fillDynamicFields } from '../shared/form-extraction/handshake-form-filler.js';
import {
  getApplicationForm,
  upsertApplicationForm,
  getAllSavedAnswers,
  getExtendedProfile,
  updateApplicationFormStatus,
} from '../data/application-forms.js';
import { getJob, updateJob } from '../data/jobs.js';
import { getProfile } from '../data/profile.js';
import { setApplicationState } from '../data/apply-state.js';
import { getApplicationStatus } from '../agents/job_scraper_agent/index.js';
import { getWrittenDocumentsForJob } from '../data/job-artifacts.js';
import { ensureWrittenDocumentPdfFromDbForArtifact } from '../agents/resume_generator_agent/written-document.js';
import { AppError, CODES } from '../shared/errors.js';
import { PATHS } from '../shared/config.js';
import {
  APPLY_HEADED,
  APPLY_BUTTON_TIMEOUT_MS,
  APPLY_MODAL_TIMEOUT_MS,
  POST_NAVIGATE_DELAY_MS,
  POST_APPLY_CLICK_DELAY_MS,
  PRE_SUBMIT_DELAY_MS,
  POST_SUBMIT_DELAY_MS,
  UPLOAD_COMPLETE_TIMEOUT_MS,
  UPLOAD_COMPLETE_POLL_MS,
  SUBMIT_MAX_RETRIES,
  SUBMIT_RETRY_DELAY_MS,
  SUBMIT_CONFIRM_TIMEOUT_MS,
} from '../shared/constants.js';
import type {
  SectionKey,
  RunHandshakeApplyOptions,
  RunHandshakeApplyResult,
} from '../shared/types.js';

export type { RunHandshakeApplyOptions, RunHandshakeApplyResult } from '../shared/types.js';

export interface HandshakeFormExtractionResult {
  requiredSections: SectionKey[];
  hasDynamicForm: boolean;
  hasWrittenDocument: boolean;
  cached: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────

function checkLoginRedirect(pageUrl: string): void {
  const host = new URL(pageUrl).hostname.toLowerCase();
  if (
    host.includes('login') ||
    host.includes('sso.') ||
    host.includes('webauth.') ||
    host.includes('idp.')
  ) {
    throw new AppError(CODES.SESSION_EXPIRED);
  }
}

async function clickApplyAndWaitForModal(page: Page): Promise<Locator> {
  const applyBtn = page.getByRole('button', { name: /apply/i }).first();
  await applyBtn.click({ timeout: APPLY_BUTTON_TIMEOUT_MS }).catch(() =>
    page.getByRole('link', { name: /apply/i }).first().click({ timeout: 5000 }),
  );
  await new Promise((r) => setTimeout(r, POST_APPLY_CLICK_DELAY_MS));

  const modal = page.locator('[data-hook="apply-modal-content"]').first();
  await modal
    .waitFor({ state: 'visible', timeout: APPLY_MODAL_TIMEOUT_MS })
    .catch(() =>
      page
        .getByText('Attach your')
        .first()
        .waitFor({ state: 'visible', timeout: 5000 }),
    );
  return modal;
}

function deriveRequiredSections(
  classifiedFields: { intent: string; fieldType: string; rawLabel: string }[],
): SectionKey[] {
  const sections: SectionKey[] = [];
  for (const f of classifiedFields) {
    if (f.fieldType !== 'file_upload') continue;
    if (f.intent === 'upload_resume' || /resume|cv/i.test(f.rawLabel)) {
      if (!sections.includes('resume')) sections.push('resume');
    } else if (f.intent === 'upload_cover_letter' || /cover/i.test(f.rawLabel)) {
      if (!sections.includes('coverLetter')) sections.push('coverLetter');
    } else if (f.intent === 'upload_transcript' || /transcript/i.test(f.rawLabel)) {
      if (!sections.includes('transcript')) sections.push('transcript');
    }
  }
  return sections;
}

// ── Extract ───────────────────────────────────────────────────────────

/**
 * Open the Handshake apply modal, detect sections, extract & classify form fields,
 * generate answers, and persist to application_forms.
 * Session validation is implicit (login redirect = SESSION_EXPIRED).
 */
export async function extractHandshakeJobForm(
  jobUrl: string,
  userId: string,
): Promise<HandshakeFormExtractionResult> {
  const normalized = toHandshakeJobDetailsUrl(jobUrl);
  const jobId = getJobIdFromUrl(normalized);
  const site = getJobSiteFromUrl(normalized) ?? 'handshake';
  const jobRef = jobId ? toJobRef(site, jobId) : '';

  // ── Cache check ──
  if (jobRef) {
    const existing = await getApplicationForm(userId, jobRef);
    if (existing && existing.classifiedFields.length > 0) {
      const requiredSections = deriveRequiredSections(existing.classifiedFields);
      const schemaSections = (existing.schema as unknown as Record<string, unknown>)
        ?.presentSections as PresentSectionConfig[] | undefined;
      if (Array.isArray(schemaSections)) {
        for (const s of schemaSections) {
          if (!requiredSections.includes(s.key as SectionKey)) {
            requiredSections.push(s.key as SectionKey);
          }
        }
      }
      console.log('[handshake] Using cached form:', requiredSections.join(', '));
      return {
        requiredSections,
        hasDynamicForm: existing.classifiedFields.some(
          (f) => f.fieldType !== 'file_upload',
        ),
        hasWrittenDocument: existing.classifiedFields.some(
          (f) => f.intent === 'upload_other_document' && f.rawInstructions,
        ),
        cached: true,
      };
    }
  }

  // ── Browser extraction ──
  const storagePath = await getHandshakeSessionPath(userId);
  if (!storagePath) throw new AppError(CODES.NO_SESSION);

  console.log('[handshake] Extracting form (browser)...');
  const browser = await launchBrowser({ headless: true });
  try {
    const context = await browser.newContext({ storageState: storagePath });
    const page = await context.newPage();

    await page.goto(normalized, { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, POST_NAVIGATE_DELAY_MS));
    checkLoginRedirect(page.url());

    const applyModal = await clickApplyAndWaitForModal(page);

    // Heading-based section detection (most reliable for file-upload sections)
    const presentSections = await getPresentSectionConfigs(page, applyModal);
    const sectionKeys = presentSections.map((s) => s.key) as SectionKey[];
    console.log('[handshake] Detected sections:', sectionKeys.join(', '));

    // DOM-based form extraction
    const extractResult = await extractHandshakeForm(page, applyModal, jobRef);

    // Classify + generate answers
    const classifiedFields = await classifyAllFields(extractResult.schema.fields);
    for (const f of classifiedFields) {
      console.log(
        `  [${f.intent}] (${(f.confidence * 100).toFixed(0)}%) ${f.rawLabel} (${f.fieldType})`,
      );
    }

    const jobRecord = jobId ? await getJob(site, jobId) : undefined;
    const [profile, extendedProfile, savedAnswers] = await Promise.all([
      getProfile(userId),
      getExtendedProfile(userId),
      getAllSavedAnswers(userId),
    ]);
    const answers = await generateAnswers({
      classifiedFields,
      profile,
      extendedProfile,
      savedAnswers,
      job: jobRecord ?? undefined,
    });

    // presentSections from heading detection overrides extractor's partial list
    const schema = { ...extractResult.schema, presentSections };
    await upsertApplicationForm({
      userId,
      jobRef,
      site,
      schema,
      classifiedFields,
      answers,
      status: 'draft',
    });

    // Union of classified-field sections + heading-detected sections
    const requiredSections = deriveRequiredSections(classifiedFields);
    for (const key of sectionKeys) {
      if (!requiredSections.includes(key)) requiredSections.push(key);
    }

    const hasDynamicForm = classifiedFields.some(
      (f) => f.fieldType !== 'file_upload',
    );
    const hasWrittenDocument = classifiedFields.some(
      (f) => f.intent === 'upload_other_document' && f.rawInstructions,
    );

    console.log(
      `[handshake] Extraction complete: ${classifiedFields.length} fields, ` +
      `${hasDynamicForm ? 'has' : 'no'} dynamic, sections: ${requiredSections.join(', ')}`,
    );
    return { requiredSections, hasDynamicForm, hasWrittenDocument, cached: false };
  } finally {
    await browser.close();
  }
}

// ── Apply ─────────────────────────────────────────────────────────────

/**
 * Open the Handshake apply modal, upload files, fill dynamic fields, and submit.
 * Expects form data in application_forms (via extractHandshakeJobForm).
 */
export async function runHandshakeApply(
  jobUrl: string,
  options: RunHandshakeApplyOptions = {},
): Promise<RunHandshakeApplyResult> {
  const userId = options.userId ?? 'default';
  const normalized = toHandshakeJobDetailsUrl(jobUrl);
  const jobId = getJobIdFromUrl(normalized);
  const site = getJobSiteFromUrl(normalized) ?? 'handshake';
  const jobRef = jobId ? toJobRef(site, jobId) : '';

  const { applicationSubmitted } = await getApplicationStatus(jobUrl, {
    fromStoreOnly: true,
    userId,
  });
  if (applicationSubmitted) return { applied: true, skipped: true };

  const files: Record<string, string> = {};
  if (options.resumePath && existsSync(options.resumePath))
    files.resume = options.resumePath;
  if (options.coverPath && existsSync(options.coverPath))
    files.coverLetter = options.coverPath;
  if (options.transcriptPath && existsSync(options.transcriptPath))
    files.transcript = options.transcriptPath;

  const formData = jobRef ? await getApplicationForm(userId, jobRef) : null;
  let presentSections: PresentSectionConfig[] =
    ((formData?.schema as unknown as Record<string, unknown>)?.presentSections as
      | PresentSectionConfig[]
      | undefined) ?? [];

  const doSubmit = options.submit ?? false;

  const storagePath = await getHandshakeSessionPath(userId);
  if (!storagePath) throw new AppError(CODES.NO_SESSION);

  if (files.resume) console.log('Using resume:', files.resume);

  const browser = await launchBrowser({ headless: !APPLY_HEADED });
  try {
    const context = await browser.newContext({ storageState: storagePath });
    const page = await context.newPage();

    await page.goto(normalized, { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, POST_NAVIGATE_DELAY_MS));
    checkLoginRedirect(page.url());

    // External apply check
    const applyButton = page.getByRole('button', { name: /apply/i }).first();
    const applyLink = page.getByRole('link', { name: /apply/i }).first();
    const buttonText =
      (await applyButton.textContent().catch(() => null))?.trim() ?? '';
    const linkText =
      (await applyLink.textContent().catch(() => null))?.trim() ?? '';
    if (
      /apply\s+externally|apply\s+external/i.test(buttonText) ||
      /apply\s+externally|apply\s+external/i.test(linkText)
    ) {
      throw new AppError(CODES.APPLY_EXTERNALLY);
    }

    // "Already Applied" banner (before clicking Apply)
    try {
      const banner = page.getByText(/Applied on .+/i).first();
      await banner.waitFor({ state: 'visible', timeout: 3000 });
      const txt = (await banner.textContent())?.trim() ?? '';
      console.log('Already applied to this job.', txt || 'Applied on [date]');
      return { applied: true, skipped: true };
    } catch (_) { }

    const applyModal = await clickApplyAndWaitForModal(page);

    // Remove pre-populated attachments
    const removeBtn = applyModal
      .locator('[data-status="positive"]')
      .getByRole('button', { name: 'Close' });
    let closeCount = await removeBtn.count();
    while (closeCount > 0) {
      await removeBtn.first().click();
      await new Promise((r) => setTimeout(r, 400));
      closeCount = await removeBtn.count();
    }

    // Fallback: detect sections live if no cached data
    if (presentSections.length === 0) {
      console.log(
        '[handshake/apply] No cached sections — detecting live...',
      );
      presentSections = await getPresentSectionConfigs(page, applyModal);
    } else {
      console.log(
        'Using cached sections:',
        presentSections.map((c) => c.key).join(', '),
      );
    }

    // ── Upload files ──
    const toAttach = presentSections.filter((c) => {
      const path = files[c.key as keyof typeof files];
      return path && existsSync(path);
    });
    const toSkip = presentSections.filter(
      (c) =>
        !files[c.key as keyof typeof files] ||
        !existsSync(files[c.key as keyof typeof files]!),
    );
    if (toAttach.length)
      console.log('Will attach:', toAttach.map((c) => c.key).join(', '));
    if (toSkip.length)
      console.log(
        'Skipping (no file):',
        toSkip.map((c) => c.key).join(', '),
      );

    for (const config of presentSections) {
      const filePath = files[config.key as keyof typeof files];
      if (!filePath || !existsSync(filePath)) continue;
      try {
        const result = await attachSection(page, applyModal, {
          ...config,
          filePath,
        });
        console.log(
          `${config.key}: ${result === 'selected' ? 'selected existing' : 'uploaded new'}`,
        );
      } catch {
        if (config.key === 'coverLetter') {
          try {
            const fallback = applyModal
              .locator(
                'input[name="file-Cover"], input[name="file-CoverLetter"]',
              )
              .first();
            await fallback.setInputFiles(filePath, { timeout: 3000 });
            console.log('coverLetter: uploaded new (fallback)');
          } catch (_) {
            console.log(
              'Skipping cover letter (not required or section not found).',
            );
          }
        } else {
          console.log(`Skipping ${config.key} (section not found).`);
        }
      }
    }

    // ── Written document PDFs ──
    if (site && jobId) {
      try {
        const docs = await getWrittenDocumentsForJob(userId, site, jobId);
        for (const doc of docs) {
          if (!doc.artifactId) continue;
          const { docPath } = await ensureWrittenDocumentPdfFromDbForArtifact(
            userId,
            site,
            jobId,
            doc.artifactId,
          );
          const classifiedField = formData?.classifiedFields.find(
            (s) => s.id === doc.artifactId,
          );
          if (
            docPath &&
            existsSync(docPath) &&
            classifiedField?.selectors?.fileInputName
          ) {
            try {
              const input = applyModal
                .locator(
                  `input[name="${classifiedField.selectors.fileInputName}"]`,
                )
                .first();
              await input.setInputFiles(docPath, { timeout: 3000 });
              console.log(`Written doc (${doc.artifactId}): uploaded`);
            } catch (err) {
              console.warn(
                `Written doc (${doc.artifactId}): upload failed —`,
                (err as Error).message,
              );
            }
          }
        }
      } catch (err) {
        console.warn(
          '[handshake/apply] Written doc upload failed (non-fatal):',
          (err as Error).message,
        );
      }
    }

    // ── Fill dynamic form fields ──
    if (formData && jobRef) {
      try {
        const dynamicFields = formData.classifiedFields.filter(
          (f) => f.fieldType !== 'file_upload',
        );
        if (dynamicFields.length > 0) {
          const answersWithValues = formData.answers.filter(
            (a) =>
              a.value && (!Array.isArray(a.value) || a.value.length > 0),
          );
          console.log(
            `[handshake/apply] Filling ${dynamicFields.length} dynamic fields (${answersWithValues.length} with values)...`,
          );
          const fillResults = await fillDynamicFields(
            page,
            applyModal,
            formData.classifiedFields,
            formData.answers,
          );
          const failed = fillResults.filter((r) => !r.success);
          if (failed.length > 0) {
            console.warn(
              `[handshake/apply] ${failed.length} field(s) failed to fill:`,
              failed.map((r) => r.error).join(', '),
            );
          }
        }
      } catch (err) {
        console.warn(
          '[handshake/apply] Dynamic form filling failed (non-fatal):',
          (err as Error).message,
        );
      }
    }

    // ── Submit ──
    let applied = false;
    if (doSubmit) {
      if (toAttach.length > 0) {
        console.log(
          `Waiting for ${toAttach.length} upload(s) to complete...`,
        );
        const deadline = Date.now() + UPLOAD_COMPLETE_TIMEOUT_MS;
        while (Date.now() < deadline) {
          const done = await applyModal
            .locator('[data-status="positive"]')
            .count();
          if (done >= toAttach.length) {
            console.log(
              `All ${toAttach.length} upload(s) confirmed (green checkmarks).`,
            );
            break;
          }
          await new Promise((r) => setTimeout(r, UPLOAD_COMPLETE_POLL_MS));
        }
      }

      await new Promise((r) => setTimeout(r, PRE_SUBMIT_DELAY_MS));

      let submitted = false;
      for (let attempt = 1; attempt <= SUBMIT_MAX_RETRIES; attempt++) {
        const submitBtn = page
          .getByRole('button', { name: /submit\s*application/i })
          .first();
        await submitBtn
          .waitFor({ state: 'visible', timeout: 5000 })
          .catch(() => { });

        const isDisabled = await submitBtn.isDisabled().catch(() => false);
        if (isDisabled && attempt < SUBMIT_MAX_RETRIES) {
          console.log(
            `Submit button disabled (attempt ${attempt}/${SUBMIT_MAX_RETRIES}). Validation may be pending — waiting...`,
          );
          await new Promise((r) => setTimeout(r, SUBMIT_RETRY_DELAY_MS));
          continue;
        }

        console.log(
          `Clicking Submit Application (attempt ${attempt}/${SUBMIT_MAX_RETRIES})...`,
        );
        await submitBtn
          .click({ force: true, timeout: 5000 })
          .catch(() =>
            page.evaluate(() => {
              const buttons = Array.from(
                document.querySelectorAll('button'),
              );
              const sub = buttons.find((b) =>
                /submit/i.test(b.textContent || ''),
              );
              if (sub) (sub as HTMLElement).click();
            }),
          );

        await new Promise((r) => setTimeout(r, POST_SUBMIT_DELAY_MS));

        try {
          await page
            .getByText(/Applied on .+/i)
            .first()
            .waitFor({
              state: 'visible',
              timeout: SUBMIT_CONFIRM_TIMEOUT_MS,
            });
          console.log('Application submitted successfully.');
          submitted = true;
          break;
        } catch (_) {
          try {
            await page
              .getByText(/Withdraw application/i)
              .first()
              .waitFor({ state: 'visible', timeout: 5000 });
            console.log('Application submitted successfully.');
            submitted = true;
            break;
          } catch (_) {
            if (attempt < SUBMIT_MAX_RETRIES) {
              console.log(
                `Submit not confirmed (attempt ${attempt}/${SUBMIT_MAX_RETRIES}). Retrying in ${SUBMIT_RETRY_DELAY_MS / 1000}s...`,
              );
              await new Promise((r) =>
                setTimeout(r, SUBMIT_RETRY_DELAY_MS),
              );
            } else {
              const screenshotDir =
                PATHS.applyScreenshots ??
                join(PATHS.output, 'apply-screenshots');
              mkdirSync(screenshotDir, { recursive: true });
              await page.screenshot({
                path: join(screenshotDir, 'after-submit-failed.png'),
              });
              console.error(
                `Submit failed after ${SUBMIT_MAX_RETRIES} attempts. Screenshot saved.`,
              );
            }
          }
        }
      }

      const submittedAt = new Date().toISOString();
      await setApplicationState(
        jobUrl,
        { resumePath: files.resume ?? '', submittedAt },
        userId,
      );
      if (submitted) {
        applied = true;
        if (jobId) {
          await setUserJobState(userId, jobRef, {
            applicationSubmitted: true,
            appliedAt: submittedAt,
          });
          const stored = await getJob(site, jobId);
          await updateJob(site, jobId, { ...(stored || { url: jobUrl }) });
          if (jobRef) {
            await updateApplicationFormStatus(
              userId,
              jobRef,
              'submitted',
            ).catch(() => { });
          }
        }
      }
    } else {
      await setApplicationState(
        jobUrl,
        { resumePath: files.resume ?? '' },
        userId,
      );
      console.log(
        'Stopped before submit. Set submit=true to submit.',
      );
    }

    return { applied };
  } finally {
    await browser.close();
  }
}
