/**
 * Handshake apply modal: for each attachment (transcript, resume, cover letter),
 * try to select an existing file by name (search) first; if not found, upload new.
 * Modal structure matches public/handshake.html: form[data-hook="apply-modal-content"], fieldsets with
 * "Attach your transcript/resume/Cover letter", then "Upload new" label + file input (name and id).
 */
import { basename } from 'path';

/**
 * Try to select an existing attachment by name from the "Search your X" dropdown; otherwise upload the file.
 * @param {import('playwright').Page} page
 * @param {import('playwright').Locator} modal - Apply modal (e.g. [data-hook="apply-modal-content"])
 * @param {{ sectionHeading: string, searchPlaceholder: string, fileInputName: string, fileInputId?: string, filePath: string }} options
 * @returns {Promise<'selected' | 'uploaded'>}
 */
export async function attachSection(page, modal, options) {
  const { sectionHeading, searchPlaceholder, fileInputName, fileInputId, filePath } = options;
  const fileNameForSearch = basename(filePath);

  const fieldset = modal.locator('fieldset').filter({
    has: page.getByRole('heading', { name: new RegExp(sectionHeading, 'i') }),
  }).first();

  try {
    const searchInput = fieldset.getByPlaceholder(new RegExp(searchPlaceholder, 'i'));
    await searchInput.click({ timeout: 5000 });
    await searchInput.fill(fileNameForSearch);
    await new Promise((r) => setTimeout(r, 800));

    const listbox = page.getByRole('listbox').first();
    const option = listbox.getByRole('option').filter({ hasText: fileNameForSearch }).first();
    await option.waitFor({ state: 'visible', timeout: 2000 });
    await option.click();
    return 'selected';
  } catch (_) {
    // No search UI (e.g. public/handshake.html) or no match — upload new
  }

  const upload = async (inputLocator) => {
    await inputLocator.setInputFiles(filePath, { timeout: 10000 });
  };

  // Try in order: within fieldset, in modal by name, whole page (real Handshake), by id (public/handshake.html)
  const withinSection = fieldset.locator(`input[name="${fileInputName}"], input[type="file"]`).first();
  const inModalByName = modal.locator(`input[name="${fileInputName}"]`).first();
  const onPage = page.locator(`input[name="${fileInputName}"]`).first();
  const byId = fileInputId ? page.locator(`#${fileInputId}`).first() : null;

  const tryAll = () =>
    upload(withinSection)
      .catch(() => upload(inModalByName))
      .catch(() => upload(onPage))
      .catch(() => (byId ? upload(byId) : Promise.reject(new Error('No file input found'))));

  try {
    await tryAll();
  } catch (_) {
    const uploadNewLabel = fieldset.getByText(/Upload\s+new/i).first();
    await uploadNewLabel.click({ timeout: 3000 }).catch(() => { });
    await new Promise((r) => setTimeout(r, 500));
    await tryAll();
  }
  return 'uploaded';
}

/** Section config aligned with public/handshake.html (legend text and input name/id). */
export const SECTION_CONFIG = {
  transcript: {
    sectionHeading: 'Attach your transcript',
    searchPlaceholder: 'Search your transcripts',
    fileInputName: 'file-Transcript',
    fileInputId: 'file-transcript',
  },
  resume: {
    sectionHeading: 'Attach your resume',
    searchPlaceholder: 'Search your resumes',
    fileInputName: 'file-Resume',
    fileInputId: 'file-resume',
  },
  coverLetter: {
    sectionHeading: 'Attach your Cover letter',
    searchPlaceholder: 'Search your cover letters',
    fileInputName: 'file-CoverLetter',
    fileInputId: 'file-cover',
  },
};
