/**
 * Handshake-specific form filler.
 * Fills non-file form fields (text, radio, select, multi_select) in the apply modal.
 */
import type { Page, Locator } from 'playwright';
import type { ClassifiedField, GeneratedAnswer } from '../types.js';

const FILL_DELAY_MS = 300;

interface FillResult {
  fieldId: string;
  success: boolean;
  error?: string;
}

/**
 * Fill a text input field.
 * Prefers stable inputName (input[name="..."]) over dynamic ID selectors.
 */
async function fillTextField(
  page: Page,
  modal: Locator,
  field: ClassifiedField,
  value: string,
): Promise<void> {
  const name = field.selectors.inputName;
  const selector = name ? `input[name="${name}"]` : field.selectors.inputSelector;
  const input = modal.locator(selector).first();
  const count = await input.count();
  if (count > 0) {
    await input.fill(value);
  } else {
    await page.locator(selector).first().fill(value);
  }
}

/**
 * Fill a radio group by clicking the matching option.
 * Locates the group by rawLabel (question text), then clicks by value or option label (no dynamic IDs).
 */
async function fillRadioField(
  page: Page,
  modal: Locator,
  field: ClassifiedField,
  value: string,
): Promise<void> {
  const matchingOption = field.options?.find((o) => o.value === value || o.label === value);
  const labelText = matchingOption?.label ?? value;

  // Find the fieldset that contains the question text (rawLabel), then the radiogroup inside it
  const container = modal.locator('fieldset').filter({
    hasText: new RegExp(escapeRegex(field.rawLabel.slice(0, 60)), 'i'),
  }).first();
  const radioGroup = container.locator('[role="radiogroup"]').first();

  // Prefer clicking the label with matching text (stable across reloads)
  const label = radioGroup.locator('label').filter({
    hasText: new RegExp(escapeRegex(labelText), 'i'),
  }).first();
  if ((await label.count()) > 0) {
    await label.click();
    return;
  }

  // Fallback: click the radio input by value (stable)
  await radioGroup.locator(`input[type="radio"][value="${escapeAttr(value)}"]`).first().click();
}

/**
 * Fill a select dropdown (combobox) by clicking to open, then selecting the option by text.
 * Prefers stable selectName to find the combobox (no dynamic IDs).
 */
// async function fillSelectField(
//   page: Page,
//   modal: Locator,
//   field: ClassifiedField,
//   value: string,
// ): Promise<void> {
//   const selectName = field.selectors.selectName;
//   let combo: Locator;

//   if (selectName) {
//     // Find the [data-size] container that has the hidden select, then the combobox inside it
//     const selectSelector = `select[name="${escapeAttr(selectName)}"]`;
//     combo = modal.locator('[data-size]').filter({ has: modal.locator(selectSelector) }).locator('[role="combobox"]').first();
//     if ((await combo.count()) === 0) {
//       combo = modal.locator('[role="combobox"]').filter({ hasText: field.rawLabel }).first();
//     }
//   } else {
//     combo = modal.locator('[role="combobox"]').filter({ hasText: field.rawLabel }).first();
//   }

//   await combo.click();
//   await new Promise((r) => setTimeout(r, FILL_DELAY_MS));

//   // Select option by visible text (stable); do not use dynamic option IDs
//   const matchingOption = field.options?.find((o) => o.value === value || o.label === value);
//   const optionText = matchingOption?.label ?? matchingOption?.value ?? value;
//   const listboxOption = page.getByRole('option', { name: new RegExp(escapeRegex(optionText), 'i') }).first();
//   await listboxOption.click();
// }
async function fillSelectField(
  page: Page,
  modal: Locator,
  field: ClassifiedField,
  value: string,
): Promise<void> {
  const selectName = field.selectors.selectName;
  let combo: Locator;
  if (selectName) {
    const selectSelector = `select[name="${escapeAttr(selectName)}"]`;
    // FIX 1: go up to the direct parent of the hidden <select>, then find the sibling combobox
    combo = modal.locator(selectSelector).locator('xpath=..').locator('[role="combobox"]').first();
    if ((await combo.count()) === 0) {
      combo = modal.locator('[role="combobox"]').filter({ hasText: field.rawLabel }).first();
    }
  } else {
    combo = modal.locator('[role="combobox"]').filter({ hasText: field.rawLabel }).first();
  }
  await combo.click();
  await new Promise((r) => setTimeout(r, FILL_DELAY_MS));
  const matchingOption = field.options?.find((o) => o.value === value || o.label === value);
  const optionText = matchingOption?.label ?? matchingOption?.value ?? value;
  // FIX 2: scope option lookup to the specific listbox via aria-controls, not page-wide
  const ariaControls = await combo.getAttribute('aria-controls');
  const listboxId = ariaControls?.split(' ').find((id) => id.startsWith('listbox-')) ?? ariaControls;
  const listbox = listboxId ? page.locator(`[id="${listboxId}"]`) : page.locator('[role="listbox"]').first();
  const listboxOption = listbox.locator('[role="option"]', { hasText: new RegExp(escapeRegex(optionText), 'i') }).first();
  await listboxOption.click();
}

async function fillMultiselectField(
  page: Page,
  modal: Locator,
  field: ClassifiedField,
  values: string[],
): Promise<void> {
  const selectName = field.selectors.selectName ?? '';
  const selectSelector = `select[name="${escapeAttr(selectName)}"]`;

  // The search input is a sibling of the hidden <select>, same parent
  const searchInput = modal.locator(selectSelector).locator('xpath=..').locator('input[type="search"][role="combobox"]').first();

  for (const value of values) {
    const matchingOption = field.options?.find((o) => o.value === value || o.label === value);
    const optionText = matchingOption?.label ?? matchingOption?.value ?? value;

    await searchInput.click();
    await new Promise((r) => setTimeout(r, FILL_DELAY_MS));

    const ariaControls = await searchInput.getAttribute('aria-controls');
    const listboxId = ariaControls?.split(' ').find((id) => id.startsWith('listbox-')) ?? ariaControls;
    const listbox = listboxId ? page.locator(`[id="${listboxId}"]`) : page.locator('[role="listbox"]').first();
    const listboxOption = listbox.locator('[role="option"]', { hasText: new RegExp(escapeRegex(optionText), 'i') }).first();
    await listboxOption.click();
    await new Promise((r) => setTimeout(r, FILL_DELAY_MS));
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Escape a string for use inside a double-quoted CSS attribute selector. */
function escapeAttr(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Fill all non-file dynamic form fields in the Handshake apply modal.
 */
export async function fillDynamicFields(
  page: Page,
  modal: Locator,
  fields: ClassifiedField[],
  answers: GeneratedAnswer[],
): Promise<FillResult[]> {
  const answerMap = new Map(answers.map((a) => [a.fieldId, a]));
  const results: FillResult[] = [];

  for (const field of fields) {
    if (field.fieldType === 'file_upload') continue;

    const answer = answerMap.get(field.id);
    if (!answer || !answer.value || (Array.isArray(answer.value) && answer.value.length === 0)) {
      results.push({ fieldId: field.id, success: true });
      continue;
    }

    const value = Array.isArray(answer.value) ? answer.value[0] : answer.value;
    if (!value) {
      results.push({ fieldId: field.id, success: true });
      continue;
    }

    try {
      switch (field.fieldType) {
        case 'text':
        case 'textarea':
          await fillTextField(page, modal, field, value);
          break;
        case 'radio':
        case 'checkbox':
          await fillRadioField(page, modal, field, value);
          break;
        case 'select':
          await fillSelectField(page, modal, field, value);
          break;
        case 'multi_select':
          // For multi-select, fill each value sequentially
          const values = Array.isArray(answer.value) ? answer.value : [value];
          // for (const v of values) {
          //   await fillSelectField(page, modal, field, v);
          //   await new Promise((r) => setTimeout(r, FILL_DELAY_MS));
          // }
          await fillMultiselectField(page, modal, field, values);
          break;
      }

      await new Promise((r) => setTimeout(r, FILL_DELAY_MS));
      results.push({ fieldId: field.id, success: true });
      console.log(`[form-filler] Filled ${field.intent}: "${value}" (${field.fieldType})`);
    } catch (err) {
      console.log({ err });

      const message = err instanceof Error ? err.message : 'Unknown error';
      console.warn(`[form-filler] Failed to fill ${field.intent} (${field.rawLabel}): ${message}`);
      results.push({ fieldId: field.id, success: false, error: message });
    }
  }

  return results;
}
