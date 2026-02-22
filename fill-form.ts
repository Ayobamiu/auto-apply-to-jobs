/**
 * Playwright form-filling bot for the job application demo.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL || 'http://localhost:8765';
const SAMPLE_PDF = join(__dirname, 'fixtures', 'sample-resume.pdf');

function ensureDir(dir: string): void {
  try {
    mkdirSync(dir, { recursive: true });
  } catch (_) {}
}

export interface FillJobApplicationFormOptions {
  firstName?: string;
  lastName?: string;
  email?: string;
  workAuth?: string;
  phone?: string;
  linkedin?: string;
  stopBeforeSubmit?: boolean;
  headless?: boolean;
  keepOpen?: boolean;
  screenshotDir?: string;
  runId?: number | null;
}

export async function fillJobApplicationForm(options: FillJobApplicationFormOptions = {}): Promise<{ success: boolean; message: string }> {
  const {
    firstName = 'Jane',
    lastName = 'Doe',
    email = 'jane.doe@example.com',
    workAuth = 'citizen',
    phone = '555-123-4567',
    linkedin = 'https://linkedin.com/in/janedoe',
    stopBeforeSubmit = true,
    headless = true,
    keepOpen = false,
    screenshotDir = join(__dirname, 'screenshots'),
    runId = null,
  } = options;

  const prefix = runId !== undefined && runId !== null ? `run-${runId}-` : '';
  ensureDir(screenshotDir);

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(BASE_URL, { waitUntil: 'load' });
    await page.waitForSelector('#first-name', { state: 'visible' });

    await page.fill('#first-name', firstName);
    await page.fill('#last-name', lastName);
    await page.fill('#email', email);
    await page.selectOption('#work-auth', { value: workAuth });

    if (workAuth === 'visa') {
      await page.waitForSelector('#visa-type', { state: 'visible', timeout: 3000 });
      await page.fill('#visa-type', 'H1B');
    } else if (workAuth === 'other') {
      await page.waitForSelector('#other-specify', { state: 'visible', timeout: 3000 });
      await page.fill('#other-specify', 'Other work authorization');
    }

    await page.waitForSelector('#application-iframe', { state: 'attached' });
    const frame = page.frameLocator('#application-iframe');
    await frame.locator('#iframe-phone').waitFor({ state: 'visible', timeout: 5000 });
    await frame.locator('#iframe-phone').fill(phone);
    await frame.locator('#iframe-linkedin').fill(linkedin);

    await page.screenshot({ path: join(screenshotDir, `${prefix}step-1-filled.png`) });

    const maxRetries = 5;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      await page.locator('#next-btn').scrollIntoViewIfNeeded();
      await page.locator('#next-btn').click();

      const step2Visible = await page.locator('#step2.active').isVisible().catch(() => false);
      if (step2Visible) break;

      await new Promise((r) => setTimeout(r, 300));
      const hasErrors = await page.locator('.error').filter({ hasText: /required|Required/ }).first().isVisible().catch(() => false);
      if (!hasErrors && attempt > 0) break;
      if (attempt === maxRetries - 1) throw new Error('Step 2 did not appear after retries (validation errors)');
    }

    await page.waitForSelector('#step2.active', { state: 'visible', timeout: 5000 });
    await page.screenshot({ path: join(screenshotDir, `${prefix}step-2-visible.png`) });

    await page.setInputFiles('#resume', SAMPLE_PDF);
    await page.check('#agree-terms');

    await page.screenshot({ path: join(screenshotDir, `${prefix}step-2-filled.png`) });

    if (stopBeforeSubmit) {
      return { success: true, message: 'Form filled; stopped before submit.' };
    }

    await page.locator('#submit-btn').click();
    return { success: true, message: 'Form submitted.' };
  } finally {
    if (!keepOpen) await browser.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fillJobApplicationForm({ stopBeforeSubmit: true, keepOpen: true })
    .then((r) => console.log(r.message))
    .catch((err) => {
      console.error('Error:', (err as Error).message);
      process.exit(1);
    });
}
