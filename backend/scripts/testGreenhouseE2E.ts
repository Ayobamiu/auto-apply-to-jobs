/**
 * End-to-end Greenhouse test: extract → fill → screenshot → (optionally submit).
 * Uses real user profile data and live Greenhouse job URLs.
 */
import 'dotenv/config';
import { chromium } from 'playwright';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import pg from 'pg';
import { extractGreenhouseForm, GreenhouseSiteFormExtractor } from '../greenhouse/extractor.js';
import type { NormalizedFormField, ClassifiedField, GeneratedAnswer, FieldIntent } from '../shared/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const FIXTURES = join(REPO_ROOT, 'fixtures');
const RESUME_PATH = join(FIXTURES, 'sample-resume.pdf');
const COVER_LETTER_PATH = join(FIXTURES, 'sample-cover-letter.pdf');
const SCREENSHOT_DIR = join(REPO_ROOT, 'examples', 'greenhouse');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

const USER_ID = '316399ab-4175-4896-a610-d52cb97d2385';

const SUBMIT = process.argv.includes('--submit');

interface UserProfile {
    name: string;
    email: string;
    phone: string;
    linkedin: string;
}

async function loadProfile(): Promise<UserProfile> {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const { rows } = await pool.query('SELECT name, email, phone, linkedin FROM profiles WHERE user_id = $1', [USER_ID]);
    await pool.end();
    if (!rows[0]) throw new Error(`Profile not found for user ${USER_ID}`);
    return rows[0] as UserProfile;
}

async function getTestJobs(): Promise<Array<{ id: string; url: string; company: string; title: string }>> {
    // Diverse set: type1 (Yugabyte), type2a with gh_jid (Cloudflare), complex type1 (Anthropic)
    return [
        { id: '4656120006', url: 'https://job-boards.greenhouse.io/yugabyte/jobs/4656120006', company: 'Yugabyte', title: 'Software Engineer' },
        { id: '7563764', url: 'https://boards.greenhouse.io/cloudflare/jobs/7563764?gh_jid=7563764', company: 'Cloudflare', title: 'Frontend Software Engineer - Cloudforce One' },
        { id: '5110532008', url: 'https://job-boards.greenhouse.io/anthropic/jobs/5110532008', company: 'Anthropic', title: 'Senior Software Engineer, Systems' },
    ];
}

function classifyIntent(label: string): FieldIntent {
    const l = label.toLowerCase();
    if (l.includes('resume') || l.includes('cv')) return 'upload_resume';
    if (l.includes('cover letter')) return 'upload_cover_letter';
    if (l.includes('transcript')) return 'upload_transcript';
    if (l.includes('first name')) return 'full_name';
    if (l.includes('last name')) return 'full_name';
    if (l.includes('email')) return 'email';
    if (l.includes('phone')) return 'phone';
    if (l.includes('linkedin')) return 'linkedin_url';
    if (l.includes('gender')) return 'eeo_gender';
    if (l.includes('hispanic') || l.includes('race') || l.includes('ethnicity')) return 'eeo_race';
    if (l.includes('veteran')) return 'eeo_veteran_status';
    if (l.includes('disability')) return 'eeo_disability';
    if (/authorized|sponsorship|visa/i.test(l)) return 'work_authorization';
    if (l.includes('school')) return 'school_name';
    if (l.includes('degree')) return 'degree_status';
    if (l.includes('discipline') || l.includes('major')) return 'major';
    return 'screening_yes_no';
}

function resolveValue(field: NormalizedFormField, profile: UserProfile): string | string[] | null {
    if (field.fieldType === 'file_upload') return null;
    const l = field.rawLabel.toLowerCase();

    // Profile-based answers
    if (/^first name$/i.test(field.rawLabel)) return profile.name.split(' ')[0];
    if (/^last name$/i.test(field.rawLabel)) return profile.name.split(' ').slice(1).join(' ');
    if (/^email$/i.test(field.rawLabel)) return profile.email;
    if (/^phone$/i.test(field.rawLabel)) return profile.phone;
    if (/linkedin/i.test(field.rawLabel)) return profile.linkedin || 'https://linkedin.com/in/example';

    // Common Greenhouse questions — short prefixes for React Select matching
    if (/^country$/i.test(field.rawLabel)) return 'United States';
    if (/location.*city/i.test(field.rawLabel)) return 'New York';
    if (/^school$/i.test(field.rawLabel)) return 'Columbia';
    if (/^degree$/i.test(field.rawLabel)) return 'Bachelor';
    if (/^discipline$/i.test(field.rawLabel)) return 'Computer';
    if (/start date month/i.test(field.rawLabel)) return 'August';
    if (/start date year/i.test(field.rawLabel)) return '2018';
    if (/end date month/i.test(field.rawLabel)) return 'May';
    if (/end date year/i.test(field.rawLabel)) return '2022';
    if (/how did you hear/i.test(field.rawLabel)) return 'Job board';
    if (/current.*employer|previous.*employer/i.test(field.rawLabel)) return 'Tech Corp';
    if (/current.*job title|previous.*job title/i.test(field.rawLabel)) return 'Software Engineer';
    if (/city.*state.*reside/i.test(field.rawLabel)) return 'New York, NY';
    if (/authorized.*work/i.test(field.rawLabel)) return 'Yes';
    if (/sponsorship|visa/i.test(field.rawLabel)) return 'No';
    if (/background.*drug|screening/i.test(field.rawLabel)) return 'Yes';
    if (/at least 18/i.test(field.rawLabel)) return 'Yes';
    if (/previously worked/i.test(field.rawLabel)) return 'No';
    if (/referred.*employee/i.test(field.rawLabel)) return 'No';
    if (/non-compete/i.test(field.rawLabel)) return 'No';
    if (/ever.*employed/i.test(field.rawLabel)) return 'No';
    if (/country.*reside/i.test(field.rawLabel)) return 'United States';

    // EEO/Demographic — decline
    if (/^gender$/i.test(field.rawLabel)) return 'Decline';
    if (/hispanic.*latino/i.test(field.rawLabel)) return 'Decline';
    if (/veteran status$/i.test(field.rawLabel)) return 'I am not';
    if (/disability status$/i.test(field.rawLabel)) return "I don";
    if (/race.*ethnicity|check all/i.test(field.rawLabel)) return 'Prefer';
    if (/your age|sexual orientation|marital status|caretaker/i.test(field.rawLabel)) return 'Prefer';

    // Generic fallbacks
    if (field.fieldType === 'checkbox' && field.options?.length) return [field.options[0].value];
    if (field.fieldType === 'radio' && field.options?.length) return field.options[0].value;
    if (field.fieldType === 'select') return 'Yes';
    if (field.fieldType === 'text' || field.fieldType === 'textarea') return 'N/A';
    return null;
}

async function run() {
    const profile = await loadProfile();
    console.log(`Profile loaded: ${profile.name} <${profile.email}>`);

    const jobs = await getTestJobs();
    if (jobs.length === 0) { console.log('No greenhouse jobs in DB'); return; }
    console.log(`Found ${jobs.length} test jobs\n`);

    const browser = await chromium.launch({ headless: false, slowMo: 50 });

    for (const job of jobs) {
        console.log(`\n${'='.repeat(70)}`);
        console.log(`${job.company}: ${job.title}`);
        console.log(`URL: ${job.url}`);
        console.log('='.repeat(70));

        const page = await browser.newPage();
        try {
            await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
            await page.waitForTimeout(2000);

            // ── Extract ──
            const result = await extractGreenhouseForm(page, `greenhouse:${job.id}`);
            console.log(`Extracted ${result.schema.fields.length} fields`);

            // ── Build answers from profile ──
            const classified: ClassifiedField[] = [];
            const answers: GeneratedAnswer[] = [];
            for (const f of result.schema.fields) {
                const intent = classifyIntent(f.rawLabel);
                classified.push({ ...f, intent, confidence: 1 });
                const val = resolveValue(f, profile);
                if (val !== null) {
                    answers.push({ fieldId: f.id, intent, value: val, source: 'profile', confidence: 1, requiresReview: false });
                }
            }
            console.log(`Generated ${answers.length} answers`);

            // ── Upload files ──
            console.log('\n--- File uploads ---');
            const uploadResults = await GreenhouseSiteFormExtractor.fillFileUpload(
                page, result.schema.fields,
                { resume: RESUME_PATH, coverLetter: COVER_LETTER_PATH },
            );
            for (const r of uploadResults) {
                const f = result.schema.fields.find(x => x.id === r.fieldId);
                console.log(`  ${r.success ? '✓' : '✗'} ${f?.rawLabel ?? r.fieldId}${r.error ? ': ' + r.error.slice(0, 100) : ''}`);
            }

            // ── Fill fields ──
            console.log('\n--- Filling fields ---');
            const fillResults = await GreenhouseSiteFormExtractor.fillForm(page, null, classified, answers);
            let ok = 0, fail = 0;
            for (const r of fillResults) {
                if (r.success) {
                    ok++;
                } else {
                    fail++;
                    const f = classified.find(x => x.id === r.fieldId);
                    console.log(`  ✗ "${f?.rawLabel}" → ${r.error?.slice(0, 120)}`);
                }
            }
            console.log(`\nFill results: ${ok} ok, ${fail} failed`);

            // ── Screenshot ──
            await page.waitForTimeout(1500);
            const slug = job.company.replace(/\s+/g, '-').toLowerCase();
            const screenshotPath = join(SCREENSHOT_DIR, `e2e-${slug}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`Screenshot → ${screenshotPath}`);

            // ── Submit (only if --submit flag) ──
            if (SUBMIT) {
                console.log('\n--- Submitting ---');
                const submitBtn = page.locator('button[type="submit"], input[type="submit"]').first();
                if (await submitBtn.count() > 0) {
                    await submitBtn.click();
                    await page.waitForTimeout(5000);
                    const body = await page.content();
                    if (body.includes('Application Received') || body.includes('application has been submitted') || body.includes('Thank you')) {
                        console.log('  ✓ Application submitted successfully!');
                    } else {
                        const errMsg = await page.locator('.error, [class*="error"], [role="alert"]').first().textContent().catch(() => '');
                        console.log(`  ? Submission result unclear. Errors: ${errMsg || 'none visible'}`);
                    }
                    const postPath = join(SCREENSHOT_DIR, `e2e-${slug}-submitted.png`);
                    await page.screenshot({ path: postPath, fullPage: true });
                    console.log(`Post-submit screenshot → ${postPath}`);
                }
            }

            console.log('\nWaiting 3s for visual inspection...');
            await page.waitForTimeout(3000);
        } catch (err) {
            console.error(`Failed for ${job.company}:`, err);
        }
    }

    console.log('\n\nDone. Browser stays open for manual inspection. Press Ctrl+C to exit.');
}

run().catch(console.error);
