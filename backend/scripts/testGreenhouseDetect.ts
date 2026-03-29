// scripts/testGreenhouseDetect.ts
import { chromium } from 'playwright';
import { detectGreenhousePageType, resolveFormFrame } from '../greenhouse/detect.js';

const TEST_URLS = [
    { label: 'Type 1', url: 'https://job-boards.greenhouse.io/taketwo/jobs/7652709' },
    { label: 'Type 2a', url: 'https://careers.airbnb.com/positions/7550345/?gh_jid=7550345' },
    { label: 'Type 2b', url: 'https://stripe.com/jobs/listing/account-executive-ai-sales/7546284' },
];

async function run() {
    const browser = await chromium.launch({ headless: false });

    for (const { label, url } of TEST_URLS) {
        console.log(`\n--- ${label} ---`);
        const page = await browser.newPage();

        try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
            const pageType = await detectGreenhousePageType(page);
            console.log(`Detected: ${pageType}`);

            const frame = await resolveFormFrame(page, pageType);
            const isFrame = frame !== page;
            console.log(`Frame resolved: ${isFrame ? 'iframe' : 'page itself'}`);

            // Verify the submit button is reachable
            const submitBtn = await (isFrame
                ? (frame as any).locator('button[type="submit"]').count()
                : page.locator('button[type="submit"]').count()
            );
            console.log(`Submit button found: ${submitBtn > 0}`);
        } catch (err) {
            console.error(`Failed for ${label}:`, err);
        } finally {
            await page.close();
        }
    }

    await browser.close();
}

run().catch(console.error);