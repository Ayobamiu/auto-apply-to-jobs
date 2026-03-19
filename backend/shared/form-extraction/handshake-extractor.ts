/**
 * Handshake-specific form extractor.
 * Extracts all field types from the apply modal using stable ARIA roles
 * and semantic HTML elements (not brittle CSS class names).
 */
import type { Page, Locator } from 'playwright';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type {
  NormalizedFormField,
  NormalizedFormSchema,
  FieldOption,
  FormFieldType,
  FieldSelectors,
  PresentSectionConfig,
  SiteFormExtractorResult,
} from '../types.js';

function fieldId(label: string, index: number): string {
  const hash = createHash('sha256').update(`${label}::${index}`).digest('hex').slice(0, 12);
  return `hs_${hash}`;
}

interface RawExtractedField {
  rawLabel: string;
  rawInstructions?: string;
  fieldType: FormFieldType;
  required: boolean;
  options?: FieldOption[];
  sectionHeading?: string;
  sectionCategory?: string;
  selectors: FieldSelectors;
}

/**
 * page.evaluate payload: runs inside the browser to extract form fields
 * from the Handshake apply modal. Returns serializable data only.
 */
function extractFieldsFromModal(modal: Element): RawExtractedField[] {
  const fields: RawExtractedField[] = [];

  function text(el: Element | null): string {
    return el ? (el.textContent || '').trim() : '';
  }

  function isRequired(label: string, el?: Element | null): boolean {
    if (/\(required\)/i.test(label)) return true;
    if (el?.hasAttribute('required') || el?.getAttribute('aria-required') === 'true') return true;
    return false;
  }

  function detectSectionCategory(heading: string, parentHeading?: string): string {
    const combined = `${heading} ${parentHeading || ''}`.toLowerCase();
    if (/equal opportunity|eeo|eeoc|diversity/i.test(combined)) return 'eeo';
    if (/screening question/i.test(combined)) return 'screening_questions';
    if (/attach|upload|document|resume|cover|transcript/i.test(combined)) return 'document_upload';
    return 'employer_questions';
  }

  // Find the current section heading for context
  function findSectionContext(el: Element): { heading: string; category: string } {
    let current: Element | null = el;
    while (current && current !== modal) {
      // Look for section headings in parent containers
      const h5 = current.querySelector(':scope > h5, :scope > .sc-ckqUJP');
      if (h5) {
        const heading = text(h5);
        if (heading && heading.length > 2) {
          return { heading, category: detectSectionCategory(heading) };
        }
      }
      // Check for "Screening Questions" or "Questions from..." headings
      const prev = current.previousElementSibling;
      if (prev) {
        const headingEl = prev.querySelector('h5');
        if (headingEl) {
          const heading = text(headingEl);
          if (heading) return { heading, category: detectSectionCategory(heading) };
        }
      }
      current = current.parentElement;
    }
    return { heading: '', category: 'other' };
  }

  // ── 1. File upload sections (fieldsets with file inputs) ──
  const fieldsets = modal.querySelectorAll('fieldset');
  fieldsets.forEach((fs) => {
    const legendEl = fs.querySelector('legend');
    const heading = text(legendEl);
    const fileInput = fs.querySelector('input[type="file"]') as HTMLInputElement | null;
    const searchInput = fs.querySelector('input[type="search"]') as HTMLInputElement | null;

    if (fileInput || searchInput) {
      let instructions: string | undefined;
      // Find employer instructions by locating the "Instructions from employer" label span
      // and reading its sibling, rather than using brittle CSS class selectors.
      const allSpans = fs.querySelectorAll('span');
      for (let i = 0; i < allSpans.length; i++) {
        const spanText = (allSpans[i].textContent || '').trim();
        if (/instructions?\s+from\s+employer/i.test(spanText)) {
          const sibling = allSpans[i].nextElementSibling;
          if (sibling) {
            instructions = (sibling.textContent || '').trim();
          }
          break;
        }
      }

      fields.push({
        rawLabel: heading || 'File upload',
        rawInstructions: instructions,
        fieldType: 'file_upload',
        required: true,
        sectionHeading: heading,
        sectionCategory: 'document_upload',
        selectors: {
          inputSelector: fileInput
            ? `input[name="${fileInput.getAttribute('name')}"]`
            : 'input[type="file"]',
          fileInputName: fileInput?.getAttribute('name') || undefined,
          searchPlaceholder: searchInput?.getAttribute('placeholder') || undefined,
        },
      });
      return;
    }

    // ── 2. Radio group fieldsets ──
    const radioGroup = fs.querySelector('[role="radiogroup"]');
    if (radioGroup) {
      const label = text(fs.querySelector('legend')) || text(fs.querySelector('p'));
      const radios = radioGroup.querySelectorAll('input[type="radio"]');
      const options: FieldOption[] = [];
      const optionSelectors: Record<string, string> = {};

      radios.forEach((radio) => {
        const r = radio as HTMLInputElement;
        const labelEl = r.id ? fs.querySelector(`label[for="${r.id}"]`) : null;
        const optLabel = text(labelEl) || r.value;
        options.push({ label: optLabel, value: r.value });
        optionSelectors[r.value] = r.id ? `#${r.id}` : `input[value="${r.value}"]`;
      });

      const radioGroupId = radioGroup.id || (radios[0] as HTMLInputElement)?.name || '';
      const ctx = findSectionContext(fs);

      fields.push({
        rawLabel: label,
        fieldType: 'radio',
        required: !/(optional|voluntary)/i.test(label),
        options,
        sectionHeading: ctx.heading,
        sectionCategory: ctx.category,
        selectors: {
          inputSelector: radioGroupId ? `[id="${radioGroupId}"]` : `[role="radiogroup"]`,
          optionSelectors,
        },
      });
      return;
    }
  });

  // ── 3. Text inputs (outside file upload sections) ──
  const allTextInputs = modal.querySelectorAll('input[type="text"]');
  allTextInputs.forEach((input) => {
    const inp = input as HTMLInputElement;
    // Skip if inside a fieldset we already handled (file upload search boxes)
    const parentFieldset = inp.closest('fieldset');
    if (parentFieldset?.querySelector('input[type="file"], input[type="search"]')) return;

    const labelId = inp.getAttribute('aria-labelledby')
      || (inp.id ? `${inp.id}-label` : '');
    const labelEl = labelId ? modal.querySelector(`#${labelId}`) : null;
    const label = text(labelEl) || inp.getAttribute('placeholder') || inp.name || '';
    if (!label) return;

    const ctx = findSectionContext(inp);

    fields.push({
      rawLabel: label,
      fieldType: 'text',
      required: isRequired(label, inp),
      sectionHeading: ctx.heading,
      sectionCategory: ctx.category,
      selectors: {
        inputSelector: inp.id ? `#${inp.id}` : `input[name="${inp.name}"]`,
      },
    });
  });

  // ── 4. Select dropdowns (combobox role with listbox) ──
  const comboboxes = modal.querySelectorAll('[role="combobox"]');
  comboboxes.forEach((combo) => {
    // Skip file upload search comboboxes (they have type="search" input inside)
    const searchInside = combo.querySelector('input[type="search"]');
    if (searchInside) {
      // Check if this is a multi-select or a regular file picker
      const parentFieldset = combo.closest('fieldset');
      if (parentFieldset?.querySelector('input[type="file"]')) return;

      // This might be a multi-select combobox (like internship dates)
      const multiList = combo.closest('[data-size]')
        ?.parentElement?.querySelector('ul[aria-multiselectable="true"]');
      if (multiList) {
        const labelId = (searchInside as HTMLInputElement).getAttribute('aria-labelledby') || '';
        const labelEl = labelId ? modal.querySelector(`#${labelId}`) : null;
        const label = text(labelEl) || '';

        const listboxId = (searchInside as HTMLInputElement).getAttribute('aria-controls')?.split(' ')[0] || '';
        const listbox = listboxId ? modal.querySelector(`#${listboxId}`) : null;
        const options: FieldOption[] = [];
        const optionSelectors: Record<string, string> = {};

        if (listbox) {
          listbox.querySelectorAll('[role="option"]').forEach((opt) => {
            const optLabel = text(opt);
            const optId = opt.id || '';
            options.push({ label: optLabel, value: optId });
            optionSelectors[optId] = `#${optId}`;
          });
        }

        const ctx = findSectionContext(searchInside);
        fields.push({
          rawLabel: label,
          fieldType: 'multi_select',
          required: isRequired(label),
          options,
          sectionHeading: ctx.heading,
          sectionCategory: ctx.category,
          selectors: {
            inputSelector: searchInside.id ? `#${(searchInside as HTMLInputElement).id}` : '[role="combobox"] input[type="search"]',
            optionSelectors,
          },
        });
        return;
      }
      return;
    }

    // Regular select dropdown (no search input, uses output element)
    const outputEl = combo.querySelector('output');
    if (!outputEl) return;

    const labelId = combo.getAttribute('aria-labelledby') || '';
    const labelEl = labelId ? modal.querySelector(`#${labelId}`) : null;
    const label = text(labelEl) || '';
    if (!label) return;

    const listboxId = combo.getAttribute('aria-controls') || '';
    const listbox = listboxId ? modal.querySelector(`#${listboxId}`) : null;
    const options: FieldOption[] = [];
    const optionSelectors: Record<string, string> = {};

    // Also grab the hidden select for form values
    const hiddenSelect = combo.closest('[data-size]')
      ?.querySelector('select[readonly]') as HTMLSelectElement | null;
    const hiddenOptions = hiddenSelect ? Array.from(hiddenSelect.options) : [];

    if (listbox) {
      const listboxOptions = listbox.querySelectorAll('[role="option"]');
      listboxOptions.forEach((opt, i) => {
        const optLabel = text(opt);
        if (optLabel === 'Select One') return;
        const hiddenValue = hiddenOptions[i]?.value || hiddenOptions[i]?.textContent?.trim() || '';
        options.push({ label: optLabel, value: hiddenValue || optLabel });
        optionSelectors[hiddenValue || optLabel] = opt.id ? `#${opt.id}` : '';
      });
    }

    const selectName = hiddenSelect?.name || '';
    const ctx = findSectionContext(combo);

    fields.push({
      rawLabel: label,
      fieldType: 'select',
      required: isRequired(label),
      options,
      sectionHeading: ctx.heading,
      sectionCategory: ctx.category,
      selectors: {
        inputSelector: hiddenSelect?.id ? `#${hiddenSelect.id}` : `select[name="${selectName}"]`,
        optionSelectors,
      },
    });
  });

  return fields;
}

/**
 * Extract all form fields from the Handshake apply modal.
 * This is the site adapter entry point.
 */
export async function extractHandshakeForm(
  page: Page,
  modalLocator: Locator,
  jobRef: string,
): Promise<SiteFormExtractorResult> {
  const element = await modalLocator.elementHandle();
  if (!element) {
    return {
      schema: { jobRef, site: 'handshake', extractedAt: new Date().toISOString(), fields: [] },
      presentSections: [],
    };
  }

  // Run extraction in browser via a string-injected script + new Function caller.
  // Passing a Node/bundled function to page.evaluate serializes it and pulls in __name (build helper), which is undefined in the page.
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const extractScript = readFileSync(
    join(__dirname, 'handshake-extract-in-browser.js'),
    'utf8',
  );
  await page.evaluate(extractScript);
  const runExtract = new Function('modal', 'return window.__extractHandshakeForm(modal)') as (
    modal: Element
  ) => RawExtractedField[];
  const rawFields: RawExtractedField[] = await page.evaluate(runExtract, element);
  await page.evaluate('delete window.__extractHandshakeForm');
  await element.dispose();

  const fields: NormalizedFormField[] = rawFields.map((raw, i) => ({
    ...raw,
    id: fieldId(raw.rawLabel, i),
    sectionCategory: raw.sectionCategory as NormalizedFormField['sectionCategory'],
  }));

  // Derive presentSections for backward compatibility with existing pipeline
  const presentSections: PresentSectionConfig[] = [];
  for (const f of fields) {
    if (f.fieldType !== 'file_upload') continue;
    const label = f.rawLabel.toLowerCase();
    if (/resume/i.test(label)) {
      presentSections.push({
        key: 'resume',
        sectionHeading: f.rawLabel,
        searchPlaceholder: f.selectors.searchPlaceholder || 'Search your resumes',
        fileInputName: f.selectors.fileInputName || 'file-Resume',
      });
    } else if (/cover\s*letter/i.test(label)) {
      presentSections.push({
        key: 'coverLetter',
        sectionHeading: f.rawLabel,
        searchPlaceholder: f.selectors.searchPlaceholder || 'Search your cover letters',
        fileInputName: f.selectors.fileInputName || 'file-CoverLetter',
      });
    } else if (/transcript/i.test(label)) {
      presentSections.push({
        key: 'transcript',
        sectionHeading: f.rawLabel,
        searchPlaceholder: f.selectors.searchPlaceholder || 'Search your transcripts',
        fileInputName: f.selectors.fileInputName || 'file-Transcript',
      });
    }
  }

  const schema: NormalizedFormSchema = {
    jobRef,
    site: 'handshake',
    extractedAt: new Date().toISOString(),
    fields,
    presentSections,
  };

  return { schema, presentSections };
}
