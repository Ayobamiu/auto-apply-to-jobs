import { readFileSync, writeFileSync } from "fs";

const input = JSON.parse(readFileSync("jobs.json", "utf-8"));

const companiesMap = new Map();

for (const job of input) {
    if (!job.url || !job.company_name) continue;

    // Extract greenhouse slug from URL
    // e.g. https://boards.greenhouse.io/sanmar/jobs/5092073007 → sanmar
    const match = job.url.match(/boards\.greenhouse\.io\/([^/]+)\//);
    if (!match) continue;

    const slug = match[1];

    if (!companiesMap.has(slug)) {
        companiesMap.set(slug, {
            company_name: job.company_name,
            greenhouse_slug: slug,
        });
    }
}

const companies = Array.from(companiesMap.values()).sort((a, b) =>
    a.company_name.localeCompare(b.company_name)
);

writeFileSync("companies.json", JSON.stringify(companies, null, 2), "utf-8");

console.log(`Extracted ${companies.length} unique companies → companies.json`);