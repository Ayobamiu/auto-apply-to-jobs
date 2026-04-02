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

/**
 * Build a CSS selector that safely targets an element by its id,
 * even when the id contains special chars like `[]`.
 */
function idSelector(id: string): string {
    if (/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(id)) return `#${id}`;
    return `[id="${id.replace(/"/g, '\\"')}"]`;
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
 * Open a React Select dropdown, read its static options, close it.
 * Skips API-loaded selects (location, school) that need typing to populate.
 */
async function scrapeReactSelectOptions(
    frame: Page | Frame,
    inputId: string,
): Promise<Array<{ label: string; value: string }> | undefined> {
    const sel = idSelector(inputId);
    const loc = frame.locator(sel);

    if (await loc.count() === 0) return undefined;

    try {
        await loc.click({ timeout: 2_000 });
        await frame.waitForTimeout(400);

        const menuOpts = frame.locator('.select__menu .select__option, .select__menu [role="option"]');
        const count = await menuOpts.count();
        if (count === 0) {
            await loc.press('Escape');
            return undefined;
        }

        const options: Array<{ label: string; value: string }> = [];
        for (let i = 0; i < count; i++) {
            const text = (await menuOpts.nth(i).textContent().catch(() => '')) ?? '';
            const trimmed = text.trim();
            if (trimmed) {
                options.push({ label: trimmed, value: trimmed });
            }
        }

        await loc.press('Escape');
        await frame.waitForTimeout(200);
        return options.length > 0 ? options : undefined;
    } catch {
        await loc.press('Escape').catch(() => { });
        return undefined;
    }
}

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

    // Scrape options from React Select combobox fields that have no options yet.
    // Static selects (Gender, Yes/No, Veteran Status, etc.) will get their options;
    // API-loaded selects (Location, School) will return undefined and rely on
    // fillReactSelect's type-and-pick strategy.
    const selectsWithoutOptions = fields.filter(
        (f) => f.fieldType === 'select' && (!f.options || f.options.length === 0) && f.id,
    );
    if (selectsWithoutOptions.length > 0) {
        console.log(`[greenhouse/extractor] Scraping options for ${selectsWithoutOptions.length} React Select fields...`);
        for (const f of selectsWithoutOptions) {
            const opts = await scrapeReactSelectOptions(frame, f.id);
            if (opts) {
                f.options = opts;
                console.log(`  ${f.rawLabel}: ${opts.length} options`);
            }
        }
    }

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

/**
 * Fill a React Select combobox. If `knownOptions` are provided (from extraction),
 * resolve the best match first and type that exact label for a precise pick.
 * Otherwise fall back to typing the raw value and picking the closest menu hit.
 */
async function fillReactSelect(
    frame: Page | Frame,
    loc: ReturnType<Frame['locator']>,
    value: string,
    knownOptions?: Array<{ label: string; value: string }>,
): Promise<void> {
    // When we have extracted options, find the best match and use its exact label.
    let searchText = value;
    if (knownOptions?.length) {
        const lv = value.toLowerCase();
        const exact = knownOptions.find((o) => o.value.toLowerCase() === lv || o.label.toLowerCase() === lv);
        const partial = !exact
            ? knownOptions.find((o) => o.label.toLowerCase().includes(lv) || lv.includes(o.label.toLowerCase().slice(0, 8)))
            : undefined;
        const match = exact ?? partial;
        if (match) searchText = match.label;
    }

    await loc.click();
    await frame.waitForTimeout(300);

    await loc.fill('');
    await loc.pressSequentially(searchText, { delay: 30 });
    await frame.waitForTimeout(1000);

    const menuOpts = frame.locator('.select__menu .select__option, .select__menu [role="option"]');
    let picked = false;

    const count = await menuOpts.count();
    if (count > 0) {
        // Try exact match on the full searchText first
        for (let i = 0; i < count && !picked; i++) {
            const text = (await menuOpts.nth(i).textContent().catch(() => '')) ?? '';
            if (text.trim().toLowerCase() === searchText.toLowerCase()) {
                await menuOpts.nth(i).click({ timeout: 3_000 });
                picked = true;
            }
        }
        // Then try partial match
        if (!picked) {
            for (let i = 0; i < count && !picked; i++) {
                const text = (await menuOpts.nth(i).textContent().catch(() => '')) ?? '';
                if (text && text.toLowerCase().includes(searchText.toLowerCase().slice(0, 8))) {
                    await menuOpts.nth(i).click({ timeout: 3_000 });
                    picked = true;
                }
            }
        }
        if (!picked) {
            await menuOpts.first().click({ timeout: 3_000 });
            picked = true;
        }
    }

    if (!picked) {
        await frame.waitForTimeout(2000);
        const lateOpts = frame.locator('.select__menu .select__option, .select__menu [role="option"]');
        if (await lateOpts.count() > 0) {
            await lateOpts.first().click({ timeout: 3_000 });
        } else {
            await loc.press('Tab');
        }
    }
}

/**
 * Click a checkbox or radio input reliably.
 * Greenhouse hides the native input behind an SVG overlay, so clicking the
 * input element directly often fails. Strategy:
 *   1. Try clicking the `<label for="inputId">` (native association).
 *   2. Fall back to force-clicking the input via { force: true }.
 *   3. Last resort: evaluate a JS click + change event.
 */
async function clickToggleInput(
    frame: Page | Frame,
    inputId: string,
): Promise<void> {
    const sel = idSelector(inputId);

    const labelSel = `label[for="${inputId.replace(/"/g, '\\"')}"]`;
    const labelCount = await frame.locator(labelSel).count();
    if (labelCount > 0) {
        await frame.locator(labelSel).first().click({ timeout: 3_000 });
        return;
    }

    try {
        await frame.locator(sel).click({ force: true, timeout: 3_000 });
    } catch {
        await frame.evaluate((id) => {
            const el = document.querySelector(`[id="${id}"]`) as HTMLInputElement | null;
            if (el) {
                el.click();
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, inputId);
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

            const inputId = field.id;
            const sel = idSelector(inputId);
            const value = Array.isArray(answer.value) ? answer.value[0] : answer.value;

            try {
                switch (field.fieldType) {
                    case 'text':
                    case 'textarea':
                        await frame.locator(sel).fill(value);
                        break;

                    case 'radio': {
                        if (field.options?.length) {
                            const match = field.options.find(
                                (o) => o.value === value || o.label.toLowerCase().includes(String(value).toLowerCase().slice(0, 8)),
                            );
                            const targetValue = match?.value ?? field.options[0]?.value;
                            const name = field.selectors.inputName;
                            if (name && targetValue) {
                                const optionInputs = await frame.locator(`input[type="radio"][name="${name}"]`).all();
                                let clicked = false;
                                for (const inp of optionInputs) {
                                    const v = await inp.getAttribute('value');
                                    if (v === targetValue) {
                                        const optId = await inp.getAttribute('id');
                                        if (optId) { await clickToggleInput(frame, optId); clicked = true; break; }
                                    }
                                }
                                if (!clicked && optionInputs.length > 0) {
                                    const firstId = await optionInputs[0].getAttribute('id');
                                    if (firstId) await clickToggleInput(frame, firstId);
                                    else await optionInputs[0].click({ force: true });
                                }
                            } else {
                                await frame.locator(sel).first().click({ force: true });
                            }
                        } else {
                            await frame.locator(sel).first().click({ force: true });
                        }
                        break;
                    }

                    case 'select': {
                        const loc = frame.locator(sel);
                        const strVal = String(value);
                        const tag = await loc.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
                        if (tag === 'select') {
                            await loc.selectOption({ value: strVal }).catch(async () => {
                                await loc.selectOption({ label: strVal });
                            });
                            break;
                        }
                        await fillReactSelect(frame, loc, strVal, field.options);
                        break;
                    }

                    case 'checkbox': {
                        const values = Array.isArray(answer.value) ? answer.value : [value];
                        const name = field.selectors.inputName;

                        if (name && field.options?.length) {
                            for (const v of values) {
                                const match = field.options.find(
                                    (o) => o.value === v || o.label.toLowerCase().includes(String(v).toLowerCase().slice(0, 8)),
                                );
                                const targetValue = match?.value ?? field.options[0]?.value;
                                const optionInputs = await frame.locator(`input[type="checkbox"][name="${name}"]`).all();
                                let clicked = false;
                                for (const inp of optionInputs) {
                                    const iv = await inp.getAttribute('value');
                                    if (iv === targetValue) {
                                        const optId = await inp.getAttribute('id');
                                        if (optId) { await clickToggleInput(frame, optId); clicked = true; break; }
                                    }
                                }
                                if (!clicked && optionInputs.length > 0) {
                                    const firstId = await optionInputs[0].getAttribute('id');
                                    if (firstId) await clickToggleInput(frame, firstId);
                                    else await optionInputs[0].check({ force: true, timeout: 5_000 });
                                }
                            }
                        } else if (name) {
                            const first = frame.locator(`input[type="checkbox"][name="${name}"]`).first();
                            const firstId = await first.getAttribute('id').catch(() => null);
                            if (firstId) await clickToggleInput(frame, firstId);
                            else await first.check({ force: true, timeout: 5_000 });
                        } else {
                            const shouldCheck = value === 'true' || value === 'yes' || value === '1';
                            if (shouldCheck) {
                                const loc = frame.locator(sel).first();
                                const locId = await loc.getAttribute('id').catch(() => null);
                                if (locId) await clickToggleInput(frame, locId);
                                else await loc.check({ force: true, timeout: 5_000 });
                            }
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

            const inputId = f.id;
            const sel = idSelector(inputId);

            try {
                const fileInput = frame.locator(sel);

                // Strategy 1: Click the visible "Attach" button and intercept the file chooser.
                // The button is a sibling of the hidden file input inside the same <div>.
                const attachBtn = frame.locator(
                    `${sel} ~ button:has-text("Attach"), ` +
                    `label[for="${inputId.replace(/"/g, '\\"')}"] ~ button:has-text("Attach"), ` +
                    `button.btn:has-text("Attach"):near(${sel})`
                ).first();

                // Broader search: find the Attach button within the .file-upload container
                const uploadGroup = frame.locator(`.file-upload:has(${sel}), [role="group"]:has(${sel})`).first();
                const groupAttachBtn = uploadGroup.locator('button:has-text("Attach")').first();

                const hasGroupBtn = await groupAttachBtn.count().catch(() => 0) > 0;
                const hasDirectBtn = await attachBtn.count().catch(() => 0) > 0;

                const btnToClick = hasGroupBtn ? groupAttachBtn : hasDirectBtn ? attachBtn : null;

                if (btnToClick) {
                    try {
                        const [fileChooser] = await Promise.all([
                            p.waitForEvent('filechooser', { timeout: 5_000 }),
                            btnToClick.click(),
                        ]);
                        await fileChooser.setFiles(filePath);
                    } catch {
                        // filechooser approach failed — fall back to setInputFiles + manual events
                        await fileInput.setInputFiles(filePath);
                        await fileInput.evaluate((el) => {
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                        });
                    }
                } else {
                    // No Attach button found — set files directly + dispatch events
                    await fileInput.setInputFiles(filePath);
                    await fileInput.evaluate((el) => {
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                    });
                }

                // Wait for UI to reflect the upload (filename appears or button text changes)
                await frame.waitForTimeout(1_500);
                const uploaded = await uploadGroup.locator('.file-upload__filename, [class*="filename"], .file-uploaded').count().catch(() => 0) > 0;
                if (uploaded) {
                    console.log(`[greenhouse/fill] Upload confirmed for ${inputId}`);
                }

                results.push({ fieldId: f.id, success: true });
            } catch (err) {
                console.error(`[greenhouse/fill] Upload failed ${f.id}:`, err);
                results.push({ fieldId: f.id, success: false, error: err instanceof Error ? err.message : String(err) });
            }
        }
        return results;
    },
};
