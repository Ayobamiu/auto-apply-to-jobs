/**
 * Playwright form-filling bot for the job application demo.
 * Fills all fields, uploads a sample PDF, goes through steps, stops before final submit.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL || 'http://localhost:8765';
const SAMPLE_PDF = join(__dirname, 'fixtures', 'sample-resume.pdf');

export async function fillJobApplicationForm(options = {}) {
  const {
    firstName = 'Jane',
    lastName = 'Doe',
    email = 'jane.doe@example.com',
    workAuth = 'citizen',
    stopBeforeSubmit = true,
  } = options;

  // const browser = await chromium.launch({ headless: options.headless !== false });
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(BASE_URL, { waitUntil: 'load' });
    await page.waitForSelector('#first-name', { state: 'visible' });

    // --- Step 1: Personal info ---
    await page.fill('#first-name', firstName);
    await page.fill('#last-name', lastName);
    await page.fill('#email', email);
    await page.selectOption('#work-auth', { value: workAuth });

    await page.locator('#next-btn').scrollIntoViewIfNeeded();
    await page.locator('#next-btn').click();
    // Step 2: wait for step2 to be visible (resume is inside it)
    await page.waitForSelector('#step2.active', { state: 'visible', timeout: 10000 });

    // --- Step 2: Resume + terms ---
    await page.setInputFiles('#resume', SAMPLE_PDF);
    await page.check('#agree-terms');

    if (stopBeforeSubmit) {
      // Bot stops here; do not click Submit
      return { success: true, message: 'Form filled; stopped before submit.' };
    }

    await page.click('#submit-btn');
    return { success: true, message: 'Form submitted.' };
  } finally {
    // await browser.close();
    console.log('Browser closed');
  }
}

// Run when executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fillJobApplicationForm({ stopBeforeSubmit: true })
    .then((r) => console.log(r.message))
    .catch((err) => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}
