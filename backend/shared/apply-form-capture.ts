/**
 * Capture apply modal form schema (sections, file inputs) for storage.
 */
import type { Page, Locator } from 'playwright';
import type { FormSection, ApplyFormSchema, PresentSectionConfig } from './types.js';

export type { FormSection, ApplyFormSchema } from './types.js';

export async function captureApplyFormSchema(page: Page, modalLocator: Locator): Promise<ApplyFormSchema> {
  const element = await modalLocator.elementHandle();
  if (!element) return { sections: [], capturedAt: new Date().toISOString() };
  const schema = await page.evaluate((modal: Element) => {
    const sections: FormSection[] = [];
    const fieldsets = modal.querySelectorAll('fieldset');
    fieldsets.forEach((fs) => {
      const headingEl = fs.querySelector('legend, h2, h3, [role="heading"], .section-heading');
      const heading = headingEl ? (headingEl.textContent || '').trim() : '';
      const fileInputs: Array<{ name?: string; id?: string }> = [];
      fs.querySelectorAll('input[type="file"]').forEach((input) => {
        fileInputs.push({ name: input.getAttribute('name') || undefined, id: input.id || undefined });
      });
      sections.push({ heading, fileInputs });
    });
    return { sections, capturedAt: new Date().toISOString() };
  }, element);
  await element.dispose();
  return schema;
}
