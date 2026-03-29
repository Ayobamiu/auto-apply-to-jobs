import { chromium } from 'playwright';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync } from 'fs';
import { extractGreenhouseForm, GreenhouseSiteFormExtractor } from '../greenhouse/extractor.js';
import type { NormalizedFormField, ClassifiedField, GeneratedAnswer, FieldIntent } from '../shared/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const RESUME_PATH = join(REPO_ROOT, 'fixtures', 'sample-resume.pdf');
const COVER_LETTER_PATH = join(REPO_ROOT, 'fixtures', 'sample-cover-letter.pdf');
const SCREENSHOT_DIR = join(REPO_ROOT, 'examples', 'greenhouse');
const FIELDS_DIR = join(REPO_ROOT, 'examples', 'form-fields');
mkdirSync(FIELDS_DIR, { recursive: true });
mkdirSync(SCREENSHOT_DIR, { recursive: true });

const TEST_URLS = [
    { label: 'Type 1', url: 'https://job-boards.greenhouse.io/thesciongroupllc/jobs/8469910002', jobRef: 'scion-8469910002' },
    { label: 'Type 2a', url: 'https://careers.airbnb.com/positions/7738432/?gh_jid=7738432', jobRef: 'airbnb-7738432' },
    { label: 'Type 2b', url: 'https://stripe.com/jobs/listing/account-executive-ai-sales/7546284', jobRef: 'stripe-7546284' },
];

// Map labels to realistic short values that React Select can filter.
// Short prefixes work best — the filler picks the first matching option.
const LABEL_TO_VALUE: Array<[RegExp, string | string[]]> = [
    [/^first name$/i, 'Jane'],
    [/^last name$/i, 'Smith'],
    [/^email$/i, 'jane.smith@example.com'],
    [/^phone$/i, '5551234567'],
    [/^country$/i, 'United States'],
    [/location.*city/i, 'San Mateo'],
    [/^school$/i, 'Columbia'],
    [/^degree$/i, 'Bachelor'],
    [/^discipline$/i, 'Computer'],
    [/start date month/i, 'August'],
    [/start date year/i, '2018'],
    [/end date month/i, 'May'],
    [/end date year/i, '2022'],
    [/linkedin/i, 'https://linkedin.com/in/janesmith'],
    [/how did you hear/i, 'Job board'],
    [/current.*employer|previous.*employer/i, 'Acme Corp'],
    [/current.*job title|previous.*job title/i, 'Software Engineer'],
    [/city.*state.*reside/i, 'San Mateo, CA'],
    [/authorized.*work/i, 'Yes'],
    [/sponsorship|visa/i, 'No'],
    [/background.*drug|screening/i, 'Yes'],
    [/at least 18/i, 'Yes'],
    [/previously worked/i, 'No'],
    [/referred.*employee/i, 'No'],
    [/non-compete/i, 'No'],
    [/ever.*employed|ever.*worked.*capacity/i, 'No'],
    [/recognize the dropdown/i, 'Yes'],
    [/provide.*first and last name/i, 'N/A'],
    // EEO / Demographic — short prefixes that match common option text
    [/^gender$/i, 'Decline'],
    [/hispanic.*latino/i, 'Decline'],
    [/veteran status$/i, 'I am not'],
    [/disability status$/i, 'I don'],
    [/describes you.*check all/i, 'Prefer'],
    [/your age/i, 'Prefer'],
    [/sexual orientation/i, 'Prefer'],
    [/race.*ethnicity/i, 'Prefer'],
    [/highest degree.*education/i, 'Prefer'],
    [/indicate.*veteran/i, 'Prefer'],
    [/disability.*neurodiverse/i, 'Prefer'],
    [/describes your disability/i, 'Prefer'],
    [/marital status/i, 'Prefer'],
    [/best describes you\./i, 'Prefer'],
    [/caretaker/i, 'Prefer'],
    [/country.*reside/i, 'United States'],
    // Checkbox fields: let the generic fallback use field.options[0].value
];

function classifyIntent(label: string): FieldIntent {
    const l = label.toLowerCase();
    if (l.includes('resume') || l.includes('cv')) return 'upload_resume';
    if (l.includes('cover letter')) return 'upload_cover_letter';
    if (l.includes('transcript')) return 'upload_transcript';
    if (l.includes('first name') || l.includes('last name') || l.includes('full name')) return 'full_name';
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

function resolveValue(field: NormalizedFormField): string | string[] | null {
    if (field.fieldType === 'file_upload') return null;

    for (const [pattern, val] of LABEL_TO_VALUE) {
        if (pattern.test(field.rawLabel)) return val;
    }

    // Generic fallbacks
    if (field.fieldType === 'checkbox' && field.options?.length) return [field.options[0].value];
    if (field.fieldType === 'radio' && field.options?.length) return field.options[0].value;
    if (field.fieldType === 'select') return 'Yes';
    if (field.fieldType === 'text' || field.fieldType === 'textarea') return 'N/A';
    return null;
}

function buildClassifiedAndAnswers(fields: NormalizedFormField[]): {
    classified: ClassifiedField[];
    answers: GeneratedAnswer[];
} {
    const classified: ClassifiedField[] = [];
    const answers: GeneratedAnswer[] = [];

    for (const f of fields) {
        const intent = classifyIntent(f.rawLabel);
        const cf: ClassifiedField = { ...f, intent, confidence: 1 };
        classified.push(cf);

        const val = resolveValue(f);
        if (val !== null) {
            answers.push({
                fieldId: f.id,
                intent,
                value: val,
                source: 'profile',
                confidence: 1,
                requiresReview: false,
            });
        }
    }
    return { classified, answers };
}

async function run() {
    const browser = await chromium.launch({ headless: false, slowMo: 50 });

    for (const { label, url, jobRef } of TEST_URLS) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`${label}: ${url}`);
        console.log('='.repeat(60));

        const page = await browser.newPage();
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });

            // ── Extract ──
            const result = await extractGreenhouseForm(page, jobRef);
            const jsonPath = join(FIELDS_DIR, `${jobRef}.json`);
            writeFileSync(jsonPath, JSON.stringify(result, null, 2));
            console.log(`Saved extraction → ${jsonPath}`);

            // ── Build mock answers ──
            const { classified, answers } = buildClassifiedAndAnswers(result.schema.fields);
            console.log(`Extracted ${result.schema.fields.length} fields, generated ${answers.length} answers\n`);

            // ── Upload files first (using filechooser) ──
            console.log('--- File uploads ---');
            const uploadResults = await GreenhouseSiteFormExtractor.fillFileUpload(
                page, result.schema.fields,
                { resume: RESUME_PATH, coverLetter: COVER_LETTER_PATH },
            );
            for (const r of uploadResults) {
                const f = result.schema.fields.find(x => x.id === r.fieldId);
                console.log(`  ${r.success ? '✓' : '✗'} ${f?.rawLabel ?? r.fieldId}${r.error ? ': ' + r.error.slice(0, 80) : ''}`);
            }

            // ── Fill text/select/radio/checkbox ──
            console.log('\n--- Filling fields ---');
            const fillResults = await GreenhouseSiteFormExtractor.fillForm(page, null, classified, answers);

            let ok = 0, fail = 0;
            for (const r of fillResults) {
                if (r.success) { ok++; }
                else {
                    fail++;
                    const ans = answers.find(a => a.fieldId === r.fieldId);
                    const f = classified.find(x => x.id === r.fieldId);
                    console.log(`  ✗ "${f?.rawLabel}" (value="${ans?.value}"): ${r.error?.slice(0, 120)}`);
                }
            }
            console.log(`\nFill results: ${ok} ok, ${fail} failed`);

            // ── Screenshot ──
            await page.waitForTimeout(1000);
            const screenshotPath = join(SCREENSHOT_DIR, `fill-${label.replace(/\s+/g, '-').toLowerCase()}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`Screenshot → ${screenshotPath}`);

            // ── Verify filled values (using the correct frame for iframes) ──
            console.log('\n--- Verification ---');
            const { resolveFormFrame: getFrame, detectGreenhousePageType: getType } = await import('../greenhouse/detect.js');
            const verifyType = await getType(page);
            const verifyFrame = await getFrame(page, verifyType);
            const verifyFails: string[] = [];
            for (const ans of answers) {
                const f = classified.find(x => x.id === ans.fieldId);
                if (!f || f.fieldType === 'file_upload' || f.fieldType === 'checkbox' || f.fieldType === 'radio') continue;
                const sel = f.selectors.inputSelector;
                try {
                    const actual = await verifyFrame.locator(sel).inputValue({ timeout: 1000 }).catch(() => '');
                    if (!actual && f.fieldType === 'select') continue;
                    if (!actual) {
                        verifyFails.push(`"${f.rawLabel}" is empty (expected "${String(ans.value).slice(0, 30)}")`);
                    }
                } catch {
                    // skip
                }
            }
            if (verifyFails.length) {
                console.log(`  ${verifyFails.length} fields may be empty:`);
                for (const msg of verifyFails) console.log(`    - ${msg}`);
            } else {
                console.log('  All verifiable fields have values.');
            }

            console.log('\nWaiting 3s for visual inspection...');
            await page.waitForTimeout(3000);
        } catch (err) {
            console.error(`Failed for ${label}:`, err);
        } finally {
            await page.close();
        }
    }

    await browser.close();
}

run().catch(console.error);
