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
    // Escape both `"` and `\` inside the attribute value; `[]` in ids is safe inside [id="..."].
    return `[id="${id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
}

/** Return true when the React Select input at `sel` is in multi-select mode. */
async function isReactSelectMulti(frame: Page | Frame, sel: string): Promise<boolean> {
    return frame.locator(sel).evaluate((el) => {
        const container = el.closest('.select-shell, .select__container');
        return !!container?.querySelector('.select__value-container--is-multi');
    }).catch(() => false);
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

// ─────────────────────────────────────────────────────────────────────────────
// Autocomplete detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IDs (or id substrings) that Greenhouse renders as async autocomplete inputs —
 * i.e. they fetch suggestions from a remote API on keystroke rather than
 * rendering a pre-populated React Select menu.
 *
 * Extend this list as new async fields are discovered.
 */
const ASYNC_AUTOCOMPLETE_IDS = [
    'candidate-location',   // geocode.earth / Pelias locality autocomplete
    'candidate_location',
    'location',
    'school_name',          // Greenhouse school search (API-backed)
    'college',
    'university',
] as const;

/**
 * Returns true when a field should be treated as an async autocomplete —
 * meaning the dropdown only populates AFTER the user types, not on click.
 */
function isAsyncAutocomplete(fieldId: string): boolean {
    const lower = fieldId.toLowerCase();
    return ASYNC_AUTOCOMPLETE_IDS.some((pattern) => lower.includes(pattern));
}

// ─────────────────────────────────────────────────────────────────────────────
// React Select helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shared option-picking logic once a React Select menu is open and populated.
 * Tries exact label match → prefix match → first available.
 */
async function pickReactSelectOption(
    frame: Page | Frame,
    searchText: string,
): Promise<boolean> {
    const menuOpts = frame.locator(
        '.select__menu .select__option, .select__menu [role="option"]',
    );
    const count = await menuOpts.count();
    if (count === 0) return false;

    // 1. Exact match
    for (let i = 0; i < count; i++) {
        const text = (await menuOpts.nth(i).textContent().catch(() => '')) ?? '';
        if (text.trim().toLowerCase() === searchText.toLowerCase()) {
            await menuOpts.nth(i).click({ timeout: 3_000 });
            return true;
        }
    }

    // 2. Partial match on first 8 chars of search term
    const prefix = searchText.toLowerCase().slice(0, 8);
    for (let i = 0; i < count; i++) {
        const text = (await menuOpts.nth(i).textContent().catch(() => '')) ?? '';
        if (text.toLowerCase().includes(prefix)) {
            await menuOpts.nth(i).click({ timeout: 3_000 });
            return true;
        }
    }

    // 3. First available
    await menuOpts.first().click({ timeout: 3_000 });
    return true;
}

/**
 * Fill a **static** React Select (options are pre-loaded, no network fetch).
 * Strategy: click to open → type to filter → pick best match.
 */
async function fillStaticReactSelect(
    frame: Page | Frame,
    loc: ReturnType<Frame['locator']>,
    value: string,
    knownOptions?: Array<{ label: string; value: string }>,
): Promise<void> {
    // Resolve the best search text from known options when available.
    let searchText = value;
    if (knownOptions?.length) {
        const lv = value.toLowerCase();
        const exact = knownOptions.find(
            (o) => o.value.toLowerCase() === lv || o.label.toLowerCase() === lv,
        );
        const partial = !exact
            ? knownOptions.find(
                (o) =>
                    o.label.toLowerCase().includes(lv) ||
                    lv.includes(o.label.toLowerCase().slice(0, 8)),
            )
            : undefined;
        const match = exact ?? partial;
        if (match) searchText = match.label;
    }

    // Open the menu, clear, type.
    await loc.click();
    await frame.waitForTimeout(300);
    await loc.fill('');
    await loc.pressSequentially(searchText, { delay: 30 });
    await frame.waitForTimeout(600);

    const picked = await pickReactSelectOption(frame, searchText);

    if (!picked) {
        // Last resort: wait a bit longer and retry once.
        await frame.waitForTimeout(1_500);
        const retried = await pickReactSelectOption(frame, searchText);
        if (!retried) await loc.press('Tab');
    }
}

/**
 * Fill a **multi-select** React Select — one where several options can be
 * chosen simultaneously (`.select__value-container--is-multi`).
 *
 * React Select multi keeps the dropdown open after each selection, so we
 * open it once and then for each value: type to filter → pick → clear the
 * input → repeat.  We never press Escape between values.
 */
async function fillMultiReactSelect(
    frame: Page | Frame,
    loc: ReturnType<Frame['locator']>,
    values: string[],
    knownOptions?: Array<{ label: string; value: string }>,
): Promise<void> {
    // Open the menu once.
    await loc.click();
    await frame.waitForTimeout(300);

    for (const raw of values) {
        // Resolve exact label when known options are available.
        let searchText = raw;
        if (knownOptions?.length) {
            const lv = raw.toLowerCase();
            const exact = knownOptions.find(
                (o) => o.value.toLowerCase() === lv || o.label.toLowerCase() === lv,
            );
            const partial = !exact
                ? knownOptions.find(
                    (o) =>
                        o.label.toLowerCase().includes(lv) ||
                        lv.includes(o.label.toLowerCase().slice(0, 8)),
                )
                : undefined;
            const match = exact ?? partial;
            if (match) searchText = match.label;
        }

        // Clear whatever the previous pick left in the input, then filter.
        await loc.fill('');
        await loc.pressSequentially(searchText, { delay: 30 });
        await frame.waitForTimeout(500);

        await pickReactSelectOption(frame, searchText);
        // After picking, React Select clears the text input but keeps the menu open.
        await frame.waitForTimeout(200);
    }

    // Close the menu when done.
    await loc.press('Escape');
}

/**
 * Fill an **async** React Select — one that fetches suggestions from a remote
 * API as the user types (e.g. candidate-location → geocode.earth,
 * school_name → Greenhouse school search).
 *
 * Key differences from the static variant:
 *   • Do NOT click first — clicking an async select before typing shows an
 *     empty or "loading" state with no options to pick.
 *   • Type directly into the input to trigger the API fetch.
 *   • Wait for the menu to actually appear in the DOM before picking,
 *     rather than using a fixed timeout. Use a generous max-wait because
 *     external API latency is unpredictable.
 *   • If the menu never appears, fall back to Tab (leaves whatever was typed).
 */
async function fillAsyncReactSelect(
    frame: Page | Frame,
    loc: ReturnType<Frame['locator']>,
    value: string,
    options: {
        /** Maximum ms to wait for the suggestion menu to appear. Default 6000. */
        menuTimeoutMs?: number;
        /** Delay between keystrokes in ms. Slower = fewer dropped API calls. Default 60. */
        keystrokeDelay?: number;
    } = {},
): Promise<void> {
    const { menuTimeoutMs = 6_000, keystrokeDelay = 60 } = options;

    // Focus the input without opening an empty dropdown.
    await loc.focus();
    await frame.waitForTimeout(150);

    // Clear any existing value before typing.
    await loc.selectText().catch(() => { });
    await loc.press('Control+a');
    await loc.press('Backspace');

    // Type slowly to give the debounced API fetch time to fire.
    await loc.pressSequentially(value, { delay: keystrokeDelay });

    // Wait for the menu to appear rather than sleeping a fixed duration.
    // The menu selector covers both React Select and custom suggestion lists
    // that Greenhouse renders for geocode.earth.
    const menuSelector = [
        '.select__menu .select__option',
        '.select__menu [role="option"]',
        '[role="listbox"] [role="option"]',
        '[role="listbox"] li',
        'ul.suggestions li',
        '[id$="-listbox"] [role="option"]',
    ].join(', ');

    try {
        await frame.waitForSelector(menuSelector, { timeout: menuTimeoutMs });
    } catch {
        // Menu never appeared — API may have failed or returned no results.
        console.warn(
            `[greenhouse/fill] Async autocomplete menu did not appear for value "${value}" ` +
            `within ${menuTimeoutMs}ms. Falling back to Tab.`,
        );
        await loc.press('Tab');
        return;
    }

    const picked = await pickReactSelectOption(frame, value);
    if (!picked) await loc.press('Tab');
}

/**
 * Fill a React Select combobox — dispatches to the static, async, or multi
 * variant based on the field id and the rendered DOM state.
 *
 * @param fieldId      The original field id (used to detect async selects).
 * @param values       All values to select. Single-select uses values[0].
 * @param knownOptions Pre-scraped options for static selects (ignored for async).
 */
async function fillReactSelect(
    frame: Page | Frame,
    loc: ReturnType<Frame['locator']>,
    values: string | string[],
    fieldId: string,
    knownOptions?: Array<{ label: string; value: string }>,
): Promise<void> {
    const valueArr = Array.isArray(values) ? values : [values];
    const sel = idSelector(fieldId);

    if (isAsyncAutocomplete(fieldId)) {
        console.log(`[greenhouse/fill] Async autocomplete detected for "${fieldId}", using async fill strategy`);
        // Async multi-selects are rare but handled: fill each value in sequence.
        for (const v of valueArr) {
            await fillAsyncReactSelect(frame, loc, v);
        }
        return;
    }

    const multi = await isReactSelectMulti(frame, sel);
    if (multi) {
        console.log(`[greenhouse/fill] Multi-select detected for "${fieldId}" (${valueArr.length} values)`);
        await fillMultiReactSelect(frame, loc, valueArr, knownOptions);
        return;
    }

    await fillStaticReactSelect(frame, loc, valueArr[0] ?? '', knownOptions);
}

// ─────────────────────────────────────────────────────────────────────────────
// Toggle / checkbox helpers (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Public extractor object
// ─────────────────────────────────────────────────────────────────────────────

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
                        const tag = await loc.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
                        // Native <select> element — use Playwright's selectOption.
                        if (tag === 'select') {
                            const allValues = Array.isArray(answer.value) ? answer.value : [String(answer.value)];
                            await loc.selectOption(allValues.map((v) => ({ value: String(v) }))).catch(async () => {
                                await loc.selectOption(allValues.map((v) => ({ label: String(v) })));
                            });
                            break;
                        }

                        // React Select (static, async, or multi) — pass the full value
                        // array so the dispatcher can choose the right fill strategy.
                        const reactValues = Array.isArray(answer.value)
                            ? answer.value.map(String)
                            : [String(answer.value)];
                        await fillReactSelect(frame, loc, reactValues, inputId, field.options);
                        break;
                    }

                    case 'multi_select': {
                        const loc = frame.locator(sel);
                        const tag = await loc.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
                        const allValues = Array.isArray(answer.value)
                            ? answer.value.map(String)
                            : [String(answer.value)];

                        if (tag === 'select') {
                            await loc.selectOption(allValues.map((v) => ({ value: v }))).catch(async () => {
                                await loc.selectOption(allValues.map((v) => ({ label: v })));
                            });
                            break;
                        }

                        await fillMultiReactSelect(frame, loc, allValues, field.options);
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
