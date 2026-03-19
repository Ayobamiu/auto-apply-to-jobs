/**
 * Lightweight probe: open a Handshake job page, click Apply, detect which
 * attachment sections are present (resume, coverLetter, transcript), then close.
 * Result is cached in apply-forms/<jobId>.json so it only runs once per job.
 *
 * Also runs the dynamic form extraction pipeline to capture and classify
 * all form fields (text, radio, select, etc.) beyond file uploads.
 */
import { launchBrowser } from './browser.js';
import { getHandshakeSessionPath } from '../data/handshake-session.js';
import { getApplyFormSchema, saveApplyFormSchema } from '../data/apply-forms.js';
import { getPresentSectionConfigs } from './handshake-attach-helper.js';
import { captureApplyFormSchema } from './apply-form-capture.js';
import { getJobIdFromUrl, getJobSiteFromUrl, toHandshakeJobDetailsUrl } from './job-from-url.js';
import { toJobRef } from '../data/user-job-state.js';
import { processDynamicForm } from './form-extraction/index.js';
import type { ProcessDynamicFormResult } from './form-extraction/index.js';
import { getJob } from '../data/jobs.js';
import { getApplicationForm } from '../data/application-forms.js';
import { AppError, CODES } from './errors.js';
import type { ProbeResult, SectionKey } from './types.js';
import {
  POST_NAVIGATE_DELAY_MS,
  APPLY_BUTTON_TIMEOUT_MS,
  POST_APPLY_CLICK_DELAY_MS,
  APPLY_MODAL_TIMEOUT_MS,
} from './constants.js';

export type { ProbeResult } from './types.js';

export interface ProbeResultExtended extends ProbeResult {
  dynamicForm?: ProcessDynamicFormResult;
}

export async function probeRequiredSections(jobUrl: string, userId: string): Promise<ProbeResultExtended> {
  const normalized = toHandshakeJobDetailsUrl(jobUrl);
  const jobId = getJobIdFromUrl(normalized);

  if (jobId) {
    const cached = getApplyFormSchema(jobId);
    // If cached present sections are found, use them
    if (cached && Array.isArray(cached.presentSections) && cached.presentSections.length > 0) {
      const keys = (cached.presentSections as Array<{ key: SectionKey }>).map((s) => s.key);

      const cachedSite = getJobSiteFromUrl(normalized) ?? 'handshake';
      const cachedJobRef = toJobRef(cachedSite, jobId);
      let hasDynamicFormData = false;
      if (cachedJobRef) {
        const existingForm = await getApplicationForm(userId, cachedJobRef);
        hasDynamicFormData = !!existingForm;
      }

      if (hasDynamicFormData) {
        console.log('[probe] Using cached form sections:', keys.join(', '));
        return { requiredSections: keys, cached: true };
      }
      console.log('[probe] Cached sections found but no dynamic form data — opening browser for extraction');
    }
  }

  const storagePath = await getHandshakeSessionPath(userId);
  if (!storagePath) {
    throw new AppError(CODES.NO_SESSION);
  }

  console.log('[probe] Opening modal to detect required sections...');
  const browser = await launchBrowser({ headless: true });
  try {
    const context = await browser.newContext({ storageState: storagePath });
    const page = await context.newPage();

    await page.goto(normalized, { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, POST_NAVIGATE_DELAY_MS));

    const url = page.url();
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('login') || host.includes('sso.') || host.includes('webauth.') || host.includes('idp.')) {
      throw new AppError(CODES.SESSION_EXPIRED);
    }

    const applyBtn = page.getByRole('button', { name: /apply/i }).first();
    await applyBtn.click({ timeout: APPLY_BUTTON_TIMEOUT_MS }).catch(() =>
      page.getByRole('link', { name: /apply/i }).first().click({ timeout: 5000 })
    );
    await new Promise((r) => setTimeout(r, POST_APPLY_CLICK_DELAY_MS));

    const applyModal = page.locator('[data-hook="apply-modal-content"]').first();
    await applyModal.waitFor({ state: 'visible', timeout: APPLY_MODAL_TIMEOUT_MS }).catch(() =>
      page.getByText('Attach your').first().waitFor({ state: 'visible', timeout: 5000 })
    );

    const presentSections = await getPresentSectionConfigs(page, applyModal);
    const keys = presentSections.map((s) => s.key);

    if (jobId) {
      let schema: Record<string, unknown>;
      try {
        schema = (await captureApplyFormSchema(page, applyModal)) as unknown as Record<string, unknown>;
      } catch {
        schema = { sections: [], capturedAt: new Date().toISOString() };
      }
      saveApplyFormSchema(jobId, { ...schema, presentSections });
    }

    // Run dynamic form extraction pipeline
    let dynamicForm: ProcessDynamicFormResult | undefined;
    const site = getJobSiteFromUrl(normalized) ?? 'handshake';
    const jid = jobId ?? getJobIdFromUrl(normalized) ?? '';
    const jobRef = toJobRef(site, jid);

    if (jobRef) {
      try {
        const jobRecord = (site && jid) ? await getJob(site, jid) : undefined;
        dynamicForm = await processDynamicForm({
          page,
          modalLocator: applyModal,
          jobRef,
          site,
          userId,
          job: jobRecord ?? undefined,
        });

        if (dynamicForm.hasDynamicFields) {
          console.log(
            `[probe] Dynamic form: ${dynamicForm.classifiedFields.length} fields extracted (${dynamicForm.classifiedFields.filter(
              (f) => f.fieldType !== 'file_upload',
            ).length} dynamic)`,
          );
        }
        const writtenDocFields = dynamicForm.classifiedFields.filter(
          (f) => f.intent === 'upload_other_document' && f.rawInstructions,
        );
        if (writtenDocFields.length > 0) {
          console.log(
            `[probe] Written document detected in ${writtenDocFields.length} field(s). First instructions: "${writtenDocFields[0].rawInstructions?.slice(
              0,
              80,
            )}..."`,
          );
        }
      } catch (err) {
        const msg = (err as Error).message;
        console.warn(`[probe] Dynamic form extraction failed (non-fatal): ${msg}`);
        if (msg.includes('No adapter registered')) {
          console.warn(`[probe] Site "${site}" has no registered form adapter. Dynamic forms will be skipped.`);
        }
      }
    }

    console.log('[probe] Required sections:', keys.join(', ') || 'none detected');
    return { requiredSections: keys, cached: false, dynamicForm };
  } finally {
    await browser.close();
  }
}
