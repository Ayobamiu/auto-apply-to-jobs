/**
 * Get job (title, company, description) from a Handshake job URL by loading the page and scraping.
 * Optionally cache by URL; cache can be used to skip scraping when fresh.
 */
import { createHash } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { chromium } from 'playwright';
import type { Page } from 'playwright';
import TurndownService from 'turndown';
import { PATHS, getPathsForUser } from './config.js';
import { setCachedJobHtml } from '../data/job-cache.js';
import type { Job } from './types.js';

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

function htmlToMarkdown(html: string): string {
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

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    u.searchParams.sort();
    return u.toString().replace(/\/$/, '');
  } catch {
    return url;
  }
}

export function cacheKey(url: string): string {
  return createHash('sha256').update(normalizeUrl(url)).digest('hex').slice(0, 16);
}

export function getJobIdFromUrl(url: string): string | null {
  const normalized = normalizeUrl(url);
  const m = normalized.match(/job-search\/(\d+)/) || normalized.match(/\/jobs\/(\d+)/);
  return m ? m[1] : null;
}

export function getJobSiteFromUrl(url: string): string {
  try {
    const host = new URL(normalizeUrl(url)).hostname.toLowerCase();
    if (host.includes('handshake')) return 'handshake';
    return host;
  } catch {
    return 'unknown';
  }
}

const HANDSHAKE_JOBS_BASE = process.env.HANDSHAKE_JOBS_BASE_URL || 'https://wmich.joinhandshake.com';

export function toHandshakeJobDetailsUrl(url: string): string {
  const id = getJobIdFromUrl(url);
  if (!id) return normalizeUrl(url);
  try {
    const u = new URL(normalizeUrl(url));
    const host = u.hostname.toLowerCase();
    if (!host.includes('handshake')) return normalizeUrl(url);
    return `${u.origin}/jobs/${id}`;
  } catch {
    const base = HANDSHAKE_JOBS_BASE.replace(/\/$/, '');
    return `${base}/jobs/${id}`;
  }
}

export type ApplyType = 'apply' | 'apply_externally' | 'none';

export interface ScrapedJob {
  title: string;
  company: string;
  description: string;
  url?: string;
  applyType: ApplyType;
  applicationSubmitted: boolean;
  jobClosed?: boolean;
  appliedAt?: string;
}

async function expandDescriptionSections(page: Page): Promise<void> {
  const moreButton = page.locator('button.view-more-button').filter({ hasText: 'More' });
  let clicked = 0;
  const maxClicks = 20;
  while (clicked < maxClicks) {
    const count = await moreButton.count();
    if (count === 0) break;
    await moreButton.first().click();
    await new Promise((r) => setTimeout(r, 500));
    clicked++;
  }
}

export async function scrapeJobFromPage(page: Page): Promise<ScrapedJob> {
  const url = page.url();

  let applicationSubmitted = false;
  let appliedAt: string | undefined;
  const appliedBanner = page.getByText(/Applied on .+/i).first();
  try {
    await appliedBanner.waitFor({ state: 'visible', timeout: 2000 });
    const text = (await appliedBanner.textContent().catch(() => null))?.trim();
    if (text) {
      applicationSubmitted = true;
      appliedAt = text;
    }
  } catch (_) {}

  let applyType: ApplyType = 'none';
  const applyButton = page.getByRole('button', { name: /apply/i }).first();
  const applyLink = page.getByRole('link', { name: /apply/i }).first();
  const buttonText = (await applyButton.textContent().catch(() => null))?.trim() ?? '';
  const linkText = (await applyLink.textContent().catch(() => null))?.trim() ?? '';
  if (/apply\s+externally|apply\s+external/i.test(buttonText) || /apply\s+externally|apply\s+external/i.test(linkText)) {
    applyType = 'apply_externally';
  } else if (buttonText.toLowerCase().includes('apply') || linkText.toLowerCase().includes('apply')) {
    applyType = 'apply';
  }

  let jobClosed = false;
  try {
    const applyByResult = await page.evaluate(() => {
      const text = document.body?.innerText ?? '';
      const match = text.match(/Apply by\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4}(?:\s+at\s+[\d:]+\s*[AP]M)?)/i);
      if (!match) return { found: false as const };
      const dateStr = match[1].trim();
      const deadline = new Date(dateStr);
      if (Number.isNaN(deadline.getTime())) return { found: true as const, closed: false };
      return { found: true as const, closed: Date.now() > deadline.getTime() };
    });
    if (applyByResult?.found && applyByResult.closed) jobClosed = true;
    if (!jobClosed) {
      const bodyText = await page.evaluate(() => document.body?.innerText ?? '');
      const closedPatterns = /closed|no longer accepting|application deadline has passed|position (is )?closed/i;
      if (closedPatterns.test(bodyText)) jobClosed = true;
    }
  } catch (_) {}

  const title = (await page.locator('h1').first().textContent().catch(() => null))?.trim() || '';

  let company = (await page.locator('a[href^="/e/"]').first().getAttribute('aria-label').catch(() => null))?.trim() || '';
  if (!company) {
    company = (await page.locator('a[href^="/e/"]').first().locator('div').first().textContent().catch(() => null))?.trim() || '';
  }
  if (!company) {
    company = (await page.locator('a[href^="/e/"]').first().textContent().catch(() => null))?.trim() || '';
  }

  await expandDescriptionSections(page);
  await new Promise((r) => setTimeout(r, 500));

  let description = '';
  const jobDetailsPage = page.locator('[data-hook="job-details-page"]').first();
  try {
    await jobDetailsPage.waitFor({ state: 'attached', timeout: 4000 });
    const htmlFromDetailsPage = await jobDetailsPage.evaluate((root: Element) => {
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
  } catch (_) {}

  if (!description || description.length < 100) {
    const descriptionBlock = page.locator('.cSDQep').first();
    try {
      await descriptionBlock.waitFor({ state: 'attached', timeout: 3000 });
      await descriptionBlock.scrollIntoViewIfNeeded().catch(() => {});
      await new Promise((r) => setTimeout(r, 500));
      const raw = await descriptionBlock.evaluate((el: Element) => el?.textContent ?? '');
      description = (raw || (await descriptionBlock.innerText().catch(() => null))?.trim() || '').trim();
      description = description.replace(/\s*(More|Less)\s*$/gm, '').trim();
    } catch (_) {}
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
    } catch (_) {}
  }

  if (!description) {
    description =
      (await page.locator('[data-hook="job-detail-description"], [class*="description"]').first().innerText().catch(() => null))?.trim()?.slice(0, 12000) || '';
  }

  return { title, company, description, url, applyType, applicationSubmitted, jobClosed, ...(appliedAt && { appliedAt }) };
}

export interface GetJobFromUrlOptions {
  useAuth?: boolean;
  cacheDir?: string;
  maxAgeMs?: number;
  headless?: boolean;
}

export async function getJobFromUrl(jobUrl: string, options: GetJobFromUrlOptions = {}): Promise<Job & { url: string }> {
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
        return { ...JSON.parse(raw), url: normalized } as Job & { url: string };
      }
    } catch (_) {}
  }

  const SCRAPE_TIMEOUT_MS = headless ? 45000 : 90000;
  if (!headless) {
    console.log('Job scrape: using visible browser (SCRAPE_HEADED=1). A window will open; it will close after scraping.');
  }

  const useAuth = options.useAuth !== false;
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext(
    useAuth && existsSync(getPathsForUser('default').authState) ? { storageState: getPathsForUser('default').authState } : {}
  );
  const page = await context.newPage();

  const doScrape = async (): Promise<Job & { url: string }> => {
    await page.goto(normalized, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 2000));

    const jobIdMatch = normalized.match(/job-search\/(\d+)/) || normalized.match(/\/jobs\/(\d+)/);
    const jid = jobIdMatch ? jobIdMatch[1] : null;
    const hasDescriptionBlock = await page.locator('.cSDQep').first().waitFor({ state: 'attached', timeout: 8000 }).then(() => true).catch(() => false);
    if (!hasDescriptionBlock && jid) {
      const jobLink = page.locator(`a[href*="${jid}"]`).first();
      if (await jobLink.count() > 0) {
        await jobLink.click();
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    await expandDescriptionSections(page);
    await new Promise((r) => setTimeout(r, 500));

    const screenshotDir = PATHS.scrapeScreenshots ?? join(PATHS.output, 'scrape-screenshots');
    mkdirSync(screenshotDir, { recursive: true });
    const screenshotPath = join(screenshotDir, `job-${fileKey}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    if (existsSync(screenshotPath)) {
      console.log('Job page screenshot:', screenshotPath);
    }

    try {
      const html = await page.content();
      setCachedJobHtml(fileKey, html);
      console.log('Job page HTML:', join(PATHS.jobCache, `${fileKey}.html`));
    } catch (_) {}

    const job = await scrapeJobFromPage(page);
    const result: Job & { url: string } = { ...job, url: normalized };
    if (jid) result.jobId = jid;

    try {
      mkdirSync(cacheDir, { recursive: true });
      const cachePayload: Record<string, unknown> = {
        title: job.title,
        company: job.company,
        description: job.description,
        url: result.url,
        jobId: result.jobId,
        applyType: job.applyType,
        applicationSubmitted: job.applicationSubmitted,
      };
      if (job.appliedAt) cachePayload.appliedAt = job.appliedAt;
      if (job.jobClosed != null) cachePayload.jobClosed = job.jobClosed;
      writeFileSync(cachePath, JSON.stringify(cachePayload, null, 2), 'utf8');
    } catch (_) {}

    return result;
  };

  try {
    const job = await Promise.race([
      doScrape(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Job scrape timed out (${SCRAPE_TIMEOUT_MS / 1000}s). The page may be slow or require login.`)), SCRAPE_TIMEOUT_MS)
      ),
    ]);
    return job;
  } finally {
    await browser.close();
  }
}

export interface GetApplicationStatusFromUrlOptions {
  headless?: boolean;
  useAuth?: boolean;
}

export async function getApplicationStatusFromUrl(
  jobUrl: string,
  options: GetApplicationStatusFromUrlOptions = {}
): Promise<{ applicationSubmitted: boolean; appliedAt?: string }> {
  const normalized = normalizeUrl(jobUrl);
  const headless = options.headless ?? !(process.env.SCRAPE_HEADED === '1' || process.env.SCRAPE_HEADED === 'true');
  const useAuth = options.useAuth !== false;
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext(
    useAuth && existsSync(getPathsForUser('default').authState) ? { storageState: getPathsForUser('default').authState } : {}
  );
  const page = await context.newPage();
  try {
    await page.goto(normalized, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise((r) => setTimeout(r, 3000));
    const appliedBanner = page.getByText(/Applied on .+/i).first();
    let applicationSubmitted = false;
    let appliedAt: string | undefined;
    try {
      await appliedBanner.waitFor({ state: 'visible', timeout: 5000 });
      const text = (await appliedBanner.textContent().catch(() => null))?.trim();
      if (text) {
        applicationSubmitted = true;
        appliedAt = text;
      }
    } catch (_) {}
    return { applicationSubmitted, ...(appliedAt && { appliedAt }) };
  } finally {
    await browser.close();
  }
}
