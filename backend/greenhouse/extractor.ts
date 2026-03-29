import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page, Frame } from 'playwright';
import type {
    NormalizedFormField,
    NormalizedFormSchema,
    PresentSectionConfig,
    SectionKey,
    SiteFormExtractorResult,
    ClassifiedField,
    GeneratedAnswer,
} from '../shared/types.js';
import { detectGreenhousePageType, resolveFormFrame } from './detect.js';

const SITE = 'greenhouse';

function slugify(label: string, index: number): string {
    return `${label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}_${index}`;
}

function detectRequiredSections(
    fields: NormalizedFormField[]
): { requiredSections: SectionKey[]; presentSections: PresentSectionConfig[] } {
    const requiredSections: SectionKey[] = [];
    const presentSections: PresentSectionConfig[] = [];

    for (const field of fields) {
        if (field.fieldType !== 'file_upload') continue;
        const label = field.rawLabel.toLowerCase();

        if (label.includes('resume') || label.includes('cv')) {
            requiredSections.push('resume');
            presentSections.push({
                key: 'resume',
                sectionHeading: field.rawLabel,
                searchPlaceholder: '',
                fileInputName: field.selectors.fileInputName ?? 'resume',
                fileInputId: field.selectors.inputSelector,
            });
        } else if (label.includes('cover letter') || label.includes('cover-letter')) {
            requiredSections.push('coverLetter');
            presentSections.push({
                key: 'coverLetter',
                sectionHeading: field.rawLabel,
                searchPlaceholder: '',
                fileInputName: field.selectors.fileInputName ?? 'cover_letter',
                fileInputId: field.selectors.inputSelector,
            });
        } else if (label.includes('transcript')) {
            requiredSections.push('transcript');
            presentSections.push({
                key: 'transcript',
                sectionHeading: field.rawLabel,
                searchPlaceholder: '',
                fileInputName: field.selectors.fileInputName ?? 'transcript',
                fileInputId: field.selectors.inputSelector,
            });
        }
    }

    return { requiredSections, presentSections };
}

interface RawExtractedField {
    rawLabel: string;
    rawInstructions: string | undefined;
    fieldType: string;
    required: boolean;
    options: Array<{ label: string; value: string }> | undefined;
    inputId: string;
    inputName: string;
    inputSelector: string;
    fileInputName: string | undefined;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const extractScript = readFileSync(
    join(__dirname, 'extract-in-browser.js'),
    'utf8',
);

/**
 * Bottom-up extraction: finds every control inside #application-form,
 * resolves its label via label[for] / aria-labelledby / aria-label,
 * deduplicates radio/checkbox groups by name, and returns the full
 * field list in a single browser round-trip.
 *
 * No container-class whitelist — new sections (EEOC, demographic,
 * compliance, custom employer sections, etc.) are picked up
 * automatically as long as they contain standard HTML form controls
 * with associated labels.
 */
export async function extractGreenhouseForm(
    page: Page,
    jobRef: string
): Promise<SiteFormExtractorResult> {
    const pageType = await detectGreenhousePageType(page);
    const frame = await resolveFormFrame(page, pageType);

    await frame.waitForSelector('#application-form, form.application--form', {
        state: 'attached',
        timeout: 45_000,
    }).catch(() => { /* page might not have id — that's ok */ });

    // Inject the extraction script (raw .js — bypasses esbuild / __name)
    await frame.evaluate(extractScript);
    const rawFields: RawExtractedField[] = await frame.evaluate(
        () => (window as any).__extractGreenhouseFields()
    );


    const fields: NormalizedFormField[] = rawFields.map((raw, i) => ({
        id: raw.inputId,
        rawLabel: raw.rawLabel,
        rawInstructions: raw.rawInstructions || undefined,
        fieldType: raw.fieldType as NormalizedFormField['fieldType'],
        required: raw.required,
        options: raw.options,
        selectors: {
            inputSelector: raw.inputSelector,
            inputName: raw.inputName || raw.inputId || undefined,
            fileInputName: raw.fileInputName || undefined,
        },
    }));

    console.log(`[greenhouse/extractor] Extracted ${fields.length} fields`);

    const { requiredSections, presentSections } = detectRequiredSections(fields);

    const schema: NormalizedFormSchema = {
        jobRef,
        site: SITE,
        extractedAt: new Date().toISOString(),
        fields,
    };

    return { schema, presentSections };
}

async function fillReactSelect(frame: Page | Frame, loc: ReturnType<Frame['locator']>, value: string): Promise<void> {
    // Click to open the dropdown + focus the combobox
    await loc.click();
    await frame.waitForTimeout(300);

    // Clear any existing search text, then type character-by-character
    // so React Select's onChange fires for each keystroke and filters options.
    await loc.fill('');
    await loc.pressSequentially(value, { delay: 30 });
    await frame.waitForTimeout(1000);

    // Look for options inside the React Select menu (NOT global [role="option"])
    const menuOpts = frame.locator('.select__menu .select__option, .select__menu [role="option"]');
    let picked = false;

    const count = await menuOpts.count();
    if (count > 0) {
        // Try exact-ish match first, then fall back to first visible option
        for (let i = 0; i < count && !picked; i++) {
            const text = await menuOpts.nth(i).textContent().catch(() => '');
            if (text && text.toLowerCase().includes(value.toLowerCase().slice(0, 8))) {
                await menuOpts.nth(i).click({ timeout: 3_000 });
                picked = true;
            }
        }
        if (!picked) {
            await menuOpts.first().click({ timeout: 3_000 });
            picked = true;
        }
    }

    if (!picked) {
        // API-loaded options (Location, School) — wait longer, then pick first
        await frame.waitForTimeout(2000);
        const lateOpts = frame.locator('.select__menu .select__option, .select__menu [role="option"]');
        if (await lateOpts.count() > 0) {
            await lateOpts.first().click({ timeout: 3_000 });
        } else {
            // Last resort: ArrowDown + Enter to accept whatever's highlighted
            await loc.press('ArrowDown');
            await frame.waitForTimeout(200);
            await loc.press('Enter');
        }
    }
}

export const GreenhouseSiteFormExtractor = {
    site: SITE,

    async extractForm(
        page: unknown,
        _modalLocator: unknown,
        jobRef: string
    ): Promise<SiteFormExtractorResult> {
        return extractGreenhouseForm(page as Page, jobRef);
    },

    async fillForm(
        page: unknown,
        _modalLocator: unknown,
        fields: ClassifiedField[],
        answers: GeneratedAnswer[]
    ): Promise<Array<{ fieldId: string; success: boolean; error?: string }>> {
        const p = page as Page;
        const pageType = await detectGreenhousePageType(p);
        const frame = await resolveFormFrame(p, pageType);
        const results: Array<{ fieldId: string; success: boolean; error?: string }> = [];

        for (const answer of answers) {
            const field = fields.find((f) => f.id === answer.fieldId);
            if (!field) {
                results.push({ fieldId: answer.fieldId, success: false, error: 'Field not found' });
                continue;
            }

            if (field.fieldType === 'file_upload') continue;

            const selector = field.selectors.inputSelector;
            const value = Array.isArray(answer.value) ? answer.value[0] : answer.value;
            const inputId = field.id;

            try {
                switch (field.fieldType) {
                    case 'text':
                    case 'textarea':
                        // await frame.locator(selector).fill(value);
                        await frame.locator(`#${inputId}`).fill(value);
                        break;

                    case 'radio': {
                        const name = field.selectors.inputName;
                        const v = String(value);
                        if (name) {
                            await frame.locator(`input[type="radio"][name="${name}"][value="${v}"]`).click();
                        } else {
                            await frame.locator(selector).first().click();
                        }
                        break;
                    }

                    case 'select': {
                        // const loc = frame.locator(selector);
                        const loc = frame.locator(`#${inputId}`);
                        const strVal = String(value);
                        const tag = await loc.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
                        if (tag === 'select') {
                            await loc.selectOption({ value: strVal }).catch(async () => {
                                await loc.selectOption({ label: strVal });
                            });
                            break;
                        }
                        await fillReactSelect(frame, loc, strVal);
                        break;
                    }

                    case 'checkbox': {
                        const name = field.selectors.inputName;
                        if (name && Array.isArray(answer.value)) {
                            for (const v of answer.value) {
                                const byVal = frame.locator(`input[type="checkbox"][name="${name}"][value="${v}"]`);
                                if (await byVal.count() > 0) {
                                    await byVal.check({ timeout: 5_000 });
                                } else {
                                    // Value doesn't match — check first unchecked box as fallback
                                    const first = frame.locator(`input[type="checkbox"][name="${name}"]`).first();
                                    await first.check({ timeout: 5_000 });
                                }
                            }
                        } else {
                            const shouldCheck = value === 'true' || value === 'yes' || value === '1';
                            if (shouldCheck) await frame.locator(selector).first().check({ timeout: 5_000 });
                        }
                        break;
                    }
                }

                results.push({ fieldId: answer.fieldId, success: true });
            } catch (err) {
                console.error(`[greenhouse/fill] Failed ${answer.fieldId}:`, err);
                results.push({
                    fieldId: answer.fieldId,
                    success: false,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }

        return results;
    },

    async fillFileUpload(
        page: unknown,
        fields: NormalizedFormField[],
        filePaths: Record<string, string>,
    ): Promise<Array<{ fieldId: string; success: boolean; error?: string }>> {
        const p = page as Page;
        const pageType = await detectGreenhousePageType(p);
        const frame = await resolveFormFrame(p, pageType);
        const results: Array<{ fieldId: string; success: boolean; error?: string }> = [];

        for (const f of fields) {
            if (f.fieldType !== 'file_upload') continue;
            const label = f.rawLabel.toLowerCase();
            let filePath: string | undefined;
            if (label.includes('resume') || label.includes('cv')) filePath = filePaths.resume;
            else if (label.includes('cover')) filePath = filePaths.coverLetter;
            else if (label.includes('transcript')) filePath = filePaths.transcript;
            if (!filePath) continue;
            try {
                // The Attach button is a sibling of the hidden file input.
                // Use filechooser event to handle the native file dialog.
                // const fileInput = frame.locator(f.selectors.inputSelector);
                const fileInput = frame.locator(`#${f.id}`);
                const attachBtn = fileInput.locator('xpath=ancestor::div[1]//button[contains(text(),"Attach")]');
                const hasDedicatedBtn = await attachBtn.count() > 0;

                if (hasDedicatedBtn) {
                    const [fileChooser] = await Promise.all([
                        p.waitForEvent('filechooser', { timeout: 5_000 }),
                        attachBtn.click(),
                    ]);
                    await fileChooser.setFiles(filePath);
                } else {
                    // Fallback: directly set files on the hidden input
                    await fileInput.setInputFiles(filePath);
                }
                await frame.waitForTimeout(500);
                results.push({ fieldId: f.id, success: true });
            } catch (err) {
                console.error(`[greenhouse/fill] Upload failed ${f.id}:`, err);
                results.push({ fieldId: f.id, success: false, error: err instanceof Error ? err.message : String(err) });
            }
        }
        return results;
    },
};