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

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    u.searchParams.sort();
    return u.toString().replace(/\/$/, '');
  } catch {
    return url;
  }
}

function cacheKey(url) {
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

  // Description: expand all "More" sections first, then read the main job description block (.sc-eBrWha)
  await expandDescriptionSections(page);
  await new Promise((r) => setTimeout(r, 300));

  const descriptionBlock = page.locator('.sc-eBrWha.cSDQep').first();
  let description = '';
  if ((await descriptionBlock.count()) > 0) {
    description = (await descriptionBlock.innerText().catch(() => null))?.trim() || '';
    // Strip button labels that may be in the same container
    description = description.replace(/\s*(More|Less)\s*$/gm, '').trim();
  }
  if (!description) {
    description =
      (await page.locator('[data-hook="job-detail-description"], [class*="description"]').first().innerText().catch(() => null))?.trim()?.slice(0, 12000) || '';
  }

  return { title, company, description, url };
}

/**
 * Get job from URL: use cache if fresh, otherwise launch browser, load page (with optional auth), scrape, and cache.
 * @param {string} jobUrl
 * @param {{ useAuth?: boolean, cacheDir?: string, maxAgeMs?: number }} options
 * @returns {Promise<{ title: string, company: string, description: string, url?: string }>}
 */
export async function getJobFromUrl(jobUrl, options = {}) {
  const normalized = normalizeUrl(jobUrl);
  const key = cacheKey(normalized);
  const cacheDir = options.cacheDir ?? PATHS.jobCache;
  const maxAgeMs = options.maxAgeMs ?? CACHE_MAX_AGE_MS;
  const cachePath = join(cacheDir, `${key}.json`);

  if (existsSync(cachePath)) {
    try {
      const stat = statSync(cachePath);
      if (Date.now() - stat.mtimeMs < maxAgeMs) {
        const raw = readFileSync(cachePath, 'utf8');
        return { ...JSON.parse(raw), url: normalized };
      }
    } catch (_) { }
  }

  const useAuth = options.useAuth !== false;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(
    useAuth && existsSync(PATHS.authState) ? { storageState: PATHS.authState } : {}
  );
  const page = await context.newPage();

  try {
    await page.goto(normalized, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle').catch(() => { });
    await new Promise((r) => setTimeout(r, 1500));

    const job = await scrapeJobFromPage(page);
    job.url = normalized;

    try {
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(cachePath, JSON.stringify({ title: job.title, company: job.company, description: job.description, url: job.url }, null, 2), 'utf8');
    } catch (_) { }

    return job;
  } finally {
    await browser.close();
  }
}
