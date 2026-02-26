/**
 * Lightweight probe: open a Handshake job page, click Apply, detect which
 * attachment sections are present (resume, coverLetter, transcript), then close.
 * Result is cached in apply-forms/<jobId>.json so it only runs once per job.
 */
import { launchBrowser } from './browser.js';
import { getHandshakeSessionPath } from '../data/handshake-session.js';
import { getApplyFormSchema, saveApplyFormSchema } from '../data/apply-forms.js';
import { getPresentSectionConfigs, type SectionKey } from './handshake-attach-helper.js';
import { captureApplyFormSchema } from './apply-form-capture.js';
import { getJobIdFromUrl, toHandshakeJobDetailsUrl } from './job-from-url.js';
import { AppError, CODES } from './errors.js';
import {
  POST_NAVIGATE_DELAY_MS,
  APPLY_BUTTON_TIMEOUT_MS,
  POST_APPLY_CLICK_DELAY_MS,
  APPLY_MODAL_TIMEOUT_MS,
} from './constants.js';

export interface ProbeResult {
  requiredSections: SectionKey[];
  cached: boolean;
}

export async function probeRequiredSections(jobUrl: string, userId: string): Promise<ProbeResult> {
  const normalized = toHandshakeJobDetailsUrl(jobUrl);
  const jobId = getJobIdFromUrl(normalized);

  if (jobId) {
    const cached = getApplyFormSchema(jobId);
    if (cached && Array.isArray(cached.presentSections) && cached.presentSections.length > 0) {
      const keys = (cached.presentSections as Array<{ key: SectionKey }>).map((s) => s.key);
      console.log('[probe] Using cached form sections:', keys.join(', '));
      return { requiredSections: keys, cached: true };
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

    console.log('[probe] Required sections:', keys.join(', ') || 'none detected');
    return { requiredSections: keys, cached: false };
  } finally {
    await browser.close();
  }
}
