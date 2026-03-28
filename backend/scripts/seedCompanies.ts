// scripts/seedCompanies.ts
import { readFileSync } from "fs";
import { pool } from "../api/db.js";


async function seed() {
    const companies: { company_name: string; greenhouse_slug: string }[] =
        JSON.parse(readFileSync("temp/companies.json", "utf-8"));

    try {
        await pool.query("BEGIN");

        for (const company of companies) {
            await pool.query(
                `INSERT INTO greenhouse_companies (company_name, greenhouse_slug)
         VALUES ($1, $2)
         ON CONFLICT (greenhouse_slug) DO UPDATE
           SET company_name = EXCLUDED.company_name`,
                [company.company_name, company.greenhouse_slug]
            );
        }

        await pool.query("COMMIT");
        console.log(`Seeded ${companies.length} companies → greenhouse_companies`);
    } catch (err) {
        await pool.query("ROLLBACK");
        throw err;
    }
}

seed().catch(console.error);