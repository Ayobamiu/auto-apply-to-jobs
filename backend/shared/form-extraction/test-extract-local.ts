/**
 * Local test: run Handshake form extraction against example HTML file.
 * Usage: from repo root: cd backend && npx tsx shared/form-extraction/test-extract-local.ts
 *        or: npm run test:extract-local (if script added)
 *
 * Loads examples/handhake-form-type-3.html, injects the extract script, runs it
 * on the apply modal, and prints extracted fields. Use to verify e.g. that
 * "Please identify your target internship dates" (multi_select) is extracted.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const repoRoot = join(__dirname, '../../..');
  const htmlPath = join(repoRoot, 'examples/handhake-form-type-3.html');
  const html = readFileSync(htmlPath, 'utf8');

  const extractScriptPath = join(__dirname, 'handshake-extract-in-browser.js');
  const extractScript = readFileSync(extractScriptPath, 'utf8');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.setContent(html, { waitUntil: 'domcontentloaded' });

  const modalLocator = page.locator('[data-hook="apply-modal-content"]').first();
  const element = await modalLocator.elementHandle();
  if (!element) {
    console.error('Modal not found: [data-hook="apply-modal-content"]');
    await browser.close();
    process.exit(1);
  }

  await page.evaluate(extractScript);
  const runExtract = new Function(
    'modal',
    'return window.__extractHandshakeForm(modal)',
  ) as (modal: Element) => RawField[];
  const rawFields: RawField[] = await page.evaluate(runExtract, element);
  await page.evaluate('delete window.__extractHandshakeForm');
  element.dispose();
  await browser.close();

  interface RawField {
    rawLabel: string;
    fieldType: string;
    selectors: { inputSelector?: string; inputName?: string; selectName?: string };
    options?: { label: string; value: string }[];
  }

  console.log('Total fields extracted:', rawFields.length);
  console.log('');

  const multiSelects = rawFields.filter((f) => f.fieldType === 'multi_select');
  console.log('multi_select fields:', multiSelects.length);
  multiSelects.forEach((f, i) => {
    console.log(`  ${i + 1}. "${f.rawLabel}"`);
    console.log('     selectName:', f.selectors?.selectName ?? '(none)');
    console.log('     options:', f.options?.length ?? 0);
  });
  console.log('');

  const internship = rawFields.filter((f) =>
    /internship\s+dates/i.test(f.rawLabel),
  );
  if (internship.length > 0) {
    console.log('SUCCESS: "internship dates" field(s) found:');
    console.log(JSON.stringify(internship, null, 2));
  } else {
    console.log('MISSING: no field with "internship dates" in rawLabel.');
    console.log('All rawLabels:');
    rawFields.forEach((f, i) =>
      console.log(`  ${i + 1}. [${f.fieldType}] ${f.rawLabel}`),
    );
  }

  console.log('');
  console.log('Full extracted fields (JSON):');
  console.log(JSON.stringify(rawFields, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
