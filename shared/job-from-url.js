/**
 * Get job (title, company, description) from a Handshake job URL by loading the page and scraping.
 * Optionally cache by URL; cache can be used to skip scraping when fresh.
 * Job details are taken from [data-hook="job-details-page"]; "Similar Jobs" and "Alumni in similar roles" sections are stripped; HTML is converted to markdown.
 */
import { createHash } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { chromium } from 'playwright';
import TurndownService from 'turndown';
import { PATHS } from './config.js';

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

/** Convert HTML string to markdown. Normalizes newlines so preview doesn't show excessive gaps. */
function htmlToMarkdown(html) {
  if (!html || typeof html !== 'string') return '';
  try {
    let md = turndown.turndown(html).trim();
    md = md.replace(/\n{3,}/g, '\n\n');
    return md;
  } catch {
    return '';
  }
}

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

/** Extract job ID from URL (e.g. job-search/10732713 or /jobs/10732713). Returns null if not found. */
export function getJobIdFromUrl(url) {
  const normalized = normalizeUrl(url);
  const m = normalized.match(/job-search\/(\d+)/) || normalized.match(/\/jobs\/(\d+)/);
  return m ? m[1] : null;
}

/** Infer job site from URL hostname (e.g. joinhandshake.com -> 'handshake'). */
export function getJobSiteFromUrl(url) {
  try {
    const host = new URL(normalizeUrl(url)).hostname.toLowerCase();
    if (host.includes('handshake')) return 'handshake';
    return host;
  } catch {
    return 'unknown';
  }
}

/** Fallback when input URL has no host (e.g. relative path). Override with HANDSHAKE_JOBS_BASE_URL for your school. */
const HANDSHAKE_JOBS_BASE = process.env.HANDSHAKE_JOBS_BASE_URL || 'https://wmich.joinhandshake.com';

/**
 * Convert any Handshake job URL (e.g. job-search/<id>?page=1 from list) to the job details URL: <same-host>/jobs/<id>.
 * Keeps the subdomain from the link you pass (e.g. wmich.joinhandshake.com, stanford.joinhandshake.com).
 * @param {string} url - Any Handshake URL containing a job id (job-search/123 or jobs/123)
 * @returns {string} Same URL if not Handshake or no id; else https://<your-school>.joinhandshake.com/jobs/<id>
 */
export function toHandshakeJobDetailsUrl(url) {
  const id = getJobIdFromUrl(url);
  if (!id) return normalizeUrl(url);
  try {
    const u = new URL(normalizeUrl(url));
    const host = u.hostname.toLowerCase();
    if (!host.includes('handshake')) return normalizeUrl(url);
    const origin = u.origin;
    return `${origin}/jobs/${id}`;
  } catch {
    const base = HANDSHAKE_JOBS_BASE.replace(/\/$/, '');
    return `${base}/jobs/${id}`;
  }
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
 * @returns {Promise<{ title: string, company: string, description: string, url?: string, applyType: 'apply' | 'apply_externally' | 'none', applicationSubmitted: boolean, appliedAt?: string }>}
 */
export async function scrapeJobFromPage(page) {
  const url = page.url();

  // Detect if user has already applied (e.g. "Applied on February 18, 2026" banner)
  let applicationSubmitted = false;
  let appliedAt = undefined;
  const appliedBanner = page.getByText(/Applied on .+/i).first();
  try {
    await appliedBanner.waitFor({ state: 'visible', timeout: 2000 });
    const text = (await appliedBanner.textContent().catch(() => null))?.trim();
    if (text) {
      applicationSubmitted = true;
      appliedAt = text;
    }
  } catch (_) { }

  // Detect apply button state: apply (in-Handshake), apply externally, or no button
  let applyType = 'none';
  const applyButton = page.getByRole('button', { name: /apply/i }).first();
  const applyLink = page.getByRole('link', { name: /apply/i }).first();
  const buttonText = (await applyButton.textContent().catch(() => null))?.trim() ?? '';
  const linkText = (await applyLink.textContent().catch(() => null))?.trim() ?? '';
  if (/apply\s+externally|apply\s+external/i.test(buttonText) || /apply\s+externally|apply\s+external/i.test(linkText)) {
    applyType = 'apply_externally';
  } else if (buttonText.toLowerCase().includes('apply') || linkText.toLowerCase().includes('apply')) {
    applyType = 'apply';
  }

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

  // Description: expand "More" sections, then prefer [data-hook="job-details-page"] (strip last two sections, HTML→markdown)
  await expandDescriptionSections(page);
  await new Promise((r) => setTimeout(r, 500));

  let description = '';
  const jobDetailsPage = page.locator('[data-hook="job-details-page"]').first();
  try {
    await jobDetailsPage.waitFor({ state: 'attached', timeout: 4000 });
    const htmlFromDetailsPage = await jobDetailsPage.evaluate((root) => {
      const container = root.firstElementChild;
      if (!container) return root.innerHTML;
      const children = Array.from(container.children);
      if (children.length >= 2) {
        children[children.length - 1].remove();
        children[children.length - 2].remove();
      }
      return root.innerHTML;
    });
    description = htmlToMarkdown(htmlFromDetailsPage).replace(/\s*(More|Less)\s*$/gm, '').trim();
    if (description.length > 500) description = description.slice(0, 20000);
  } catch (_) { }

  if (!description || description.length < 100) {
    const descriptionBlock = page.locator('.cSDQep').first();
    try {
      await descriptionBlock.waitFor({ state: 'attached', timeout: 3000 });
      await descriptionBlock.scrollIntoViewIfNeeded().catch(() => { });
      await new Promise((r) => setTimeout(r, 500));
      const raw = await descriptionBlock.evaluate((el) => el?.textContent ?? '');
      description = (raw || (await descriptionBlock.innerText().catch(() => null))?.trim() || '').trim();
      description = description.replace(/\s*(More|Less)\s*$/gm, '').trim();
    } catch (_) { }
  }

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

  return { title, company, description, url, applyType, applicationSubmitted, ...(appliedAt && { appliedAt }) };
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
  const hashKey = cacheKey(normalized);
  const jobId = getJobIdFromUrl(jobUrl);
  const fileKey = jobId || hashKey;
  const cacheDir = options.cacheDir ?? PATHS.jobCache;
  const maxAgeMs = options.maxAgeMs ?? CACHE_MAX_AGE_MS;
  const cachePath = join(cacheDir, `${fileKey}.json`);

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
    const screenshotPath = join(screenshotDir, `job-${fileKey}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => { });
    if (existsSync(screenshotPath)) {
      console.log('Job page screenshot:', screenshotPath);
    }

    // Store full page HTML in job-cache for debugging / offline use
    try {
      const html = await page.content();
      mkdirSync(cacheDir, { recursive: true });
      const htmlPath = join(cacheDir, `${fileKey}.html`);
      writeFileSync(htmlPath, html, 'utf8');
      console.log('Job page HTML:', htmlPath);
    } catch (_) { }

    const job = await scrapeJobFromPage(page);
    job.url = normalized;
    if (jobId) job.jobId = jobId;

    try {
      mkdirSync(cacheDir, { recursive: true });
      const cachePayload = { title: job.title, company: job.company, description: job.description, url: job.url, jobId: job.jobId, applyType: job.applyType, applicationSubmitted: job.applicationSubmitted };
      if (job.appliedAt) cachePayload.appliedAt = job.appliedAt;
      writeFileSync(cachePath, JSON.stringify(cachePayload, null, 2), 'utf8');
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

/**
 * Get only application-submitted status from the job page (no full scrape).
 * Loads the URL, checks for "Applied on ..." banner, returns status. Use when you only need to know if applied.
 * @param {string} jobUrl
 * @param {{ headless?: boolean }} [options]
 * @returns {Promise<{ applicationSubmitted: boolean, appliedAt?: string }>}
 */
export async function getApplicationStatusFromUrl(jobUrl, options = {}) {
  const normalized = normalizeUrl(jobUrl);
  const headless = options.headless ?? !(process.env.SCRAPE_HEADED === '1' || process.env.SCRAPE_HEADED === 'true');
  const useAuth = options.useAuth !== false;
  const browser = await chromium.launch({ headless: headless });
  const context = await browser.newContext(
    useAuth && existsSync(PATHS.authState) ? { storageState: PATHS.authState } : {}
  );
  const page = await context.newPage();
  try {
    await page.goto(normalized, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise((r) => setTimeout(r, 3000));
    const appliedBanner = page.getByText(/Applied on .+/i).first();
    let applicationSubmitted = false;
    let appliedAt = undefined;
    try {
      await appliedBanner.waitFor({ state: 'visible', timeout: 5000 });
      const text = (await appliedBanner.textContent().catch(() => null))?.trim();
      if (text) {
        applicationSubmitted = true;
        appliedAt = text;
      }
    } catch (_) { }
    return { applicationSubmitted, ...(appliedAt && { appliedAt }) };
  } finally {
    await browser.close();
  }
}
