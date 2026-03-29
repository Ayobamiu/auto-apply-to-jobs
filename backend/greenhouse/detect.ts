import type { Page, Frame } from 'playwright';

/**
 * Types of links from greenhouse
 * Type 1 — URL is on greenhouse's own job board domain
 * Type 2a — custom career site with greenhouse iframe embedded
 * Type 2b — custom career site with an Apply Now button/link
 */
export type GreenhousePageType = 'type1' | 'type2a' | 'type2b';

export async function detectGreenhousePageType(
    page: Page
): Promise<GreenhousePageType> {
    const url = page.url();

    if (url.includes('job-boards.greenhouse.io')) {
        return 'type1';
    }

    // Greenhouse job id in query string ⇒ embedded board (Airbnb, etc.) even if iframe hydrates late
    if (/\bgh_jid=/.test(url)) {
        return 'type2a';
    }

    let iframeCount = await page.locator('iframe[src*="greenhouse.io"]').count();
    if (iframeCount === 0) {
        await page.waitForSelector('iframe[src*="greenhouse.io"]', { timeout: 10_000 }).catch(() => undefined);
        iframeCount = await page.locator('iframe[src*="greenhouse.io"]').count();
    }
    if (iframeCount > 0) return 'type2a';

    const applyButtonCount = await page
        .locator([
            'a[href*="/apply"]',
            'button:has-text("Apply now")',
            'a:has-text("Apply now")',
            'button:has-text("Apply")',
            'a:has-text("Apply")',
        ].join(', '))
        .count();
    if (applyButtonCount > 0) return 'type2b';

    // Fallback — treat as type1 and attempt direct form extraction
    console.warn(`[greenhouse/detect] Could not detect page type for ${url}, defaulting to type1`);
    return 'type1';
}

const IFRAME_WAIT_TIMEOUT_MS = 15_000;
const TAB_CLICK_DELAY_MS = 1_500;
const NAVIGATION_WAIT_TIMEOUT_MS = 15_000;

export async function resolveFormFrame(
    page: Page,
    pageType: GreenhousePageType
): Promise<Page | Frame> {
    switch (pageType) {
        case 'type1':
            return page;

        case 'type2a': {
            // Click the Application tab to reveal the iframe
            const appTab = page.locator([
                '[data-tab="application"]',
                'a:has-text("Application")',
                'button:has-text("Application")',
            ].join(', ')).first();

            const tabExists = await appTab.count();
            if (tabExists > 0) {
                await appTab.click();
                await page.waitForTimeout(TAB_CLICK_DELAY_MS);
            }

            // Wait for the greenhouse iframe to appear
            await page.waitForSelector('iframe[src*="greenhouse.io"]', {
                timeout: IFRAME_WAIT_TIMEOUT_MS,
            });

            const fromFrames = page
                .frames()
                .find((f) => {
                    const u = f.url();
                    return (
                        /greenhouse\.io/.test(u) &&
                        (/embed|job-board|job_app/i.test(u) || u.includes('greenhouse.io'))
                    );
                });
            const frame = fromFrames ?? page.frame({ url: /greenhouse\.io/ });
            if (!frame) {
                console.warn('[greenhouse/detect] type2a: iframe found in DOM but Frame not accessible, falling back to page');
                return page;
            }
            return frame;
        }

        case 'type2b': {
            // Click the Apply Now button and wait for navigation
            const applyBtn = page.locator([
                'a[href*="/apply"]',
                'button:has-text("Apply now")',
                'a:has-text("Apply now")',
                'button:has-text("Apply")',
                'a:has-text("Apply")',
            ].join(', ')).first();

            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle', timeout: NAVIGATION_WAIT_TIMEOUT_MS }),
                applyBtn.click(),
            ]);

            // Re-detect after navigation — the apply page may be type1 or type2a
            const newType = await detectGreenhousePageType(page);
            console.log(`[greenhouse/detect] type2b navigated → detected as ${newType}`);

            if (newType === 'type2a') {
                return resolveFormFrame(page, 'type2a');
            }
            // type1 or fallback — form is directly on the page
            return page;
        }
    }
}