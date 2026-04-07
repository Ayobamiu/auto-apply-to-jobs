import { writeFileSync } from "fs";

const companies = [
    "airbnb", "adobe", "amazon", "amd", "anthropic", "apple", "asana",
    "atlassian", "bytedance", "cloudflare", "coinbase", "crowdstrike",
    "databricks", "datadog", "doordash", "dropbox", "duolingo", "figma",
    "google", "ibm", "instacart", "intel", "linkedin", "lyft", "meta",
    "microsoft", "netflix", "notion", "nvidia", "openai", "oracle",
    "palantir", "paypal", "perplexity", "pinterest", "ramp", "reddit",
    "rippling", "robinhood", "roblox", "salesforce", "samsara", "servicenow",
    "shopify", "slack", "snap", "snapchat", "spacex", "splunk", "snowflake",
    "stripe", "square", "tesla", "tinder", "tiktok", "uber", "visa",
    "waymo", "x",
];

async function checkCompany(slug) {
    try {
        const res = await fetch(
            `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
            { signal: AbortSignal.timeout(8000) }
        );
        if (res.status === 200) {
            const data = await res.json();
            const jobCount = data.jobs?.length ?? 0;
            console.log(`✓ ${slug} (${jobCount} jobs)`);
            return { slug, jobCount, found: true };
        }
        console.log(`✗ ${slug} (${res.status})`);
        return { slug, found: false };
    } catch (err) {
        console.log(`✗ ${slug} (error: ${err.message})`);
        return { slug, found: false };
    }
}

async function run() {
    console.log(`Checking ${companies.length} companies on Greenhouse...\n`);

    const results = [];

    // Process in batches of 5 to avoid rate limiting
    const BATCH_SIZE = 5;
    for (let i = 0; i < companies.length; i += BATCH_SIZE) {
        const batch = companies.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(checkCompany));
        results.push(...batchResults);
        if (i + BATCH_SIZE < companies.length) {
            await new Promise((r) => setTimeout(r, 300));
        }
    }

    const found = results
        .filter((r) => r.found)
        .sort((a, b) => a.slug.localeCompare(b.slug));

    const notFound = results
        .filter((r) => !r.found)
        .map((r) => r.slug)
        .sort();

    console.log(`\n--- Results ---`);
    console.log(`Found on Greenhouse: ${found.length}/${companies.length}`);
    console.log(`Not found: ${notFound.join(", ")}`);

    const output = found.map((r) => ({
        greenhouse_slug: r.slug,
        company_name: r.slug.charAt(0).toUpperCase() + r.slug.slice(1),
        job_count: r.jobCount,
    }));

    writeFileSync("faang_greenhouse.json", JSON.stringify(output, null, 2));
    console.log(`\nSaved ${found.length} companies → faang_greenhouse.json`);
}

run().catch(console.error);