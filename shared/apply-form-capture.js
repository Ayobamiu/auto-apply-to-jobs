/**
 * Capture apply modal form schema (sections, file inputs) for storage.
 *
 * How form-capture works:
 * 1. When the apply script opens the Handshake apply modal, it calls captureApplyFormSchema(page, applyModal).
 * 2. We pass the modal DOM element into the browser via page.evaluate(), so the code runs inside the page.
 * 3. Inside the modal we find every <fieldset>, and for each: the section heading (legend/h2/h3) and any
 *    <input type="file"> name/id. That gives a list of sections and their file inputs (e.g. transcript, resume, cover).
 * 4. We return that structure plus capturedAt. The apply script then calls data/apply-forms.saveApplyFormSchema(jobId, schema),
 *    which writes data/apply-forms/<jobId>.json. No file I/O in this module.
 */

/**
 * Extract form schema from apply modal element.
 * @param {import('playwright').Page} page
 * @param {import('playwright').Locator} modalLocator - Apply modal (e.g. [data-hook="apply-modal-content"])
 * @returns {Promise<{ sections: Array<{ heading: string, fileInputs: Array<{ name?: string, id?: string }> }>, capturedAt: string }>}
 */
export async function captureApplyFormSchema(page, modalLocator) {
  const element = await modalLocator.elementHandle();
  if (!element) return { sections: [], capturedAt: new Date().toISOString() };
  const schema = await page.evaluate((modal) => {
    const sections = [];
    const fieldsets = modal.querySelectorAll('fieldset');
    fieldsets.forEach((fs) => {
      const headingEl = fs.querySelector('legend, h2, h3, [role="heading"], .section-heading');
      const heading = headingEl ? (headingEl.textContent || '').trim() : '';
      const fileInputs = [];
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
