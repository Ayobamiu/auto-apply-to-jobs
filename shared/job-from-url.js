/**
 * Get job (title, company, description) from a Handshake job URL by loading the page and scraping.
 * Optionally cache by URL; cache can be used to skip scraping when fresh.
 */
import { createHash } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { chromium } from 'playwright';
import { PATHS } from './config.js';

const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    u.searchParams.sort();
    return u.toString().replace(/\/$/, '');
  } catch {
    return url;
  }
}

export function cacheKey(url) {
  return createHash('sha256').update(normalizeUrl(url)).digest('hex').slice(0, 16);
}

/**
 * Expand all "Learn more" / "More" description sections on a Handshake job page so the full description is visible.
 * Clicks every button.view-more-button that shows "More" (aria-label "Show more (...)") until none left.
 * @param {import('playwright').Page} page
 */
async function expandDescriptionSections(page) {
  // Click every "More" button (collapsed description); when expanded the same button shows "Less"
  const moreButton = page.locator('button.view-more-button').filter({ hasText: 'More' });
  let clicked = 0;
  const maxClicks = 20; // avoid infinite loop
  while (clicked < maxClicks) {
    const count = await moreButton.count();
    if (count === 0) break;
    await moreButton.first().click();
    await new Promise((r) => setTimeout(r, 500));
    clicked++;
  }
}

/**
 * Scrape job title, company, description from the current Handshake job page.
 * Uses selectors matching Handshake's DOM (see examples/handshake-job-example-*.html).
 * Expands any "More" / "Learn more" description sections before reading so the full description is captured.
 * @param {import('playwright').Page} page
 * @returns {Promise<{ title: string, company: string, description: string, url?: string }>}
 */
export async function scrapeJobFromPage(page) {
  const url = page.url();

  // Title: first h1 on the page (job detail title)
  const title =
    (await page.locator('h1').first().textContent().catch(() => null))?.trim() || '';

  // Company: employer link a[href^="/e/"] has aria-label="CompanyName" or contains div with company name (e.g. .sc-hZgNLr)
  let company =
    (await page.locator('a[href^="/e/"]').first().getAttribute('aria-label').catch(() => null))?.trim() || '';
  if (!company) {
    company =
      (await page.locator('a[href^="/e/"]').first().locator('div').first().textContent().catch(() => null))?.trim() || '';
  }
  if (!company) {
    company =
      (await page.locator('a[href^="/e/"]').first().textContent().catch(() => null))?.trim() || '';
  }

  // Description: expand all "More" sections first, then wait for the description block and read it (.cSDQep)
  await expandDescriptionSections(page);
  await new Promise((r) => setTimeout(r, 500));

  // Description: try multiple patterns (Handshake varies by school/build)
  // 1) .cSDQep — example / some builds
  // 2) div preceding button.view-more-button — wmich and other real job detail pages
  let description = '';
  const descriptionBlock = page.locator('.cSDQep').first();
  try {
    await descriptionBlock.waitFor({ state: 'attached', timeout: 3000 });
    await descriptionBlock.scrollIntoViewIfNeeded().catch(() => { });
    await new Promise((r) => setTimeout(r, 500));
    const raw = await descriptionBlock.evaluate((el) => el?.textContent ?? '');
    description = (raw || (await descriptionBlock.innerText().catch(() => null))?.trim() || '').trim();
    description = description.replace(/\s*(More|Less)\s*$/gm, '').trim();
  } catch (_) { }

  if (!description) {
    try {
      const fromViewMore = await page.evaluate(() => {
        const btn = document.querySelector('button.view-more-button');
        if (!btn) return '';
        const parent = btn.parentElement;
        if (!parent) return '';
        const container = parent.previousElementSibling || parent.firstElementChild;
        if (!container) return '';
        const text = container.textContent ?? '';
        return text.replace(/\s*(More|Less)\s*$/gm, '').trim();
      });
      if (fromViewMore && fromViewMore.length > 100) description = fromViewMore.slice(0, 15000);
    } catch (_) { }
  }

  if (!description) {
    description =
      (await page.locator('[data-hook="job-detail-description"], [class*="description"]').first().innerText().catch(() => null))?.trim()?.slice(0, 12000) || '';
  }

  return { title, company, description, url };
}

/**
 * Get job from URL: use cache if fresh, otherwise launch browser, load page (with optional auth), scrape, and cache.
 * Set SCRAPE_HEADED=1 (or options.headless: false) to use a visible browser; can avoid bot-protection on some sites.
 * @param {string} jobUrl
 * @param {{ useAuth?: boolean, cacheDir?: string, maxAgeMs?: number, headless?: boolean }} options
 * @returns {Promise<{ title: string, company: string, description: string, url?: string }>}
 */
export async function getJobFromUrl(jobUrl, options = {}) {
  const normalized = normalizeUrl(jobUrl);
  const key = cacheKey(normalized);
  const cacheDir = options.cacheDir ?? PATHS.jobCache;
  const maxAgeMs = options.maxAgeMs ?? CACHE_MAX_AGE_MS;
  const cachePath = join(cacheDir, `${key}.json`);

  const headless = options.headless ?? !(process.env.SCRAPE_HEADED === '1' || process.env.SCRAPE_HEADED === 'true');
  const skipCache = !headless;

  if (!skipCache && existsSync(cachePath)) {
    try {
      const stat = statSync(cachePath);
      if (Date.now() - stat.mtimeMs < maxAgeMs) {
        const raw = readFileSync(cachePath, 'utf8');
        return { ...JSON.parse(raw), url: normalized };
      }
    } catch (_) { }
  }

  const SCRAPE_TIMEOUT_MS = headless ? 45000 : 90000;
  if (!headless) {
    console.log('Job scrape: using visible browser (SCRAPE_HEADED=1). A window will open; it will close after scraping.');
  }

  const useAuth = options.useAuth !== false;
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext(
    useAuth && existsSync(PATHS.authState) ? { storageState: PATHS.authState } : {}
  );
  const page = await context.newPage();

  const doScrape = async () => {
    await page.goto(normalized, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => { });
    await new Promise((r) => setTimeout(r, 2000));

    // Job detail (and .cSDQep) may load async or require opening the job; wait, else try clicking job link
    const jobIdMatch = normalized.match(/job-search\/(\d+)/) || normalized.match(/\/jobs\/(\d+)/);
    const jobId = jobIdMatch ? jobIdMatch[1] : null;
    const hasDescriptionBlock = await page.locator('.cSDQep').first().waitFor({ state: 'attached', timeout: 8000 }).then(() => true).catch(() => false);
    if (!hasDescriptionBlock && jobId) {
      const jobLink = page.locator(`a[href*="${jobId}"]`).first();
      if (await jobLink.count() > 0) {
        await jobLink.click();
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    // Expand "More" so full description is visible before screenshot
    await expandDescriptionSections(page);
    await new Promise((r) => setTimeout(r, 500));

    const screenshotDir = PATHS.scrapeScreenshots ?? join(PATHS.output, 'scrape-screenshots');
    mkdirSync(screenshotDir, { recursive: true });
    const screenshotPath = join(screenshotDir, `job-${key}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => { });
    if (existsSync(screenshotPath)) {
      console.log('Job page screenshot:', screenshotPath);
    }

    // Store full page HTML in job-cache for debugging / offline use
    try {
      const html = await page.content();
      mkdirSync(cacheDir, { recursive: true });
      const htmlPath = join(cacheDir, `${key}.html`);
      writeFileSync(htmlPath, html, 'utf8');
      console.log('Job page HTML:', htmlPath);
    } catch (_) { }

    const job = await scrapeJobFromPage(page);
    job.url = normalized;

    try {
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(cachePath, JSON.stringify({ title: job.title, company: job.company, description: job.description, url: job.url }, null, 2), 'utf8');
    } catch (_) { }

    return job;
  };

  try {
    const job = await Promise.race([
      doScrape(),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Job scrape timed out (${SCRAPE_TIMEOUT_MS / 1000}s). The page may be slow or require login.`)), SCRAPE_TIMEOUT_MS)),
    ]);
    return job;
  } finally {
    await browser.close();
  }
}
