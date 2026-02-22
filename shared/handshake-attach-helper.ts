/**
 * Handshake apply modal: for each attachment, try to select by name first; if not found, upload new.
 */
import { basename } from 'path';
import type { Page, Locator } from 'playwright';

export interface AttachSectionOptions {
  sectionHeading: string;
  searchPlaceholder: string;
  fileInputName: string;
  fileInputId?: string;
  filePath: string;
}

export async function attachSection(page: Page, modal: Locator, options: AttachSectionOptions): Promise<'selected' | 'uploaded'> {
  const { sectionHeading, searchPlaceholder, fileInputName, fileInputId, filePath } = options;
  const fileNameForSearch = basename(filePath);

  const fieldset = modal
    .locator('fieldset')
    .filter({
      has: page.getByRole('heading', { name: new RegExp(sectionHeading, 'i') }),
    })
    .first();

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
  } catch (_) {}

  const upload = async (inputLocator: Locator) => {
    await inputLocator.setInputFiles(filePath, { timeout: 10000 });
  };

  const withinSection = fieldset.locator(`input[name="${fileInputName}"], input[type="file"]`).first();
  const inModalByName = modal.locator(`input[name="${fileInputName}"]`).first();
  const onPage = page.locator(`input[name="${fileInputName}"]`).first();
  const byId = fileInputId ? page.locator(`#${fileInputId}`).first() : null;

  const tryAll = (): Promise<void> =>
    upload(withinSection)
      .catch(() => upload(inModalByName))
      .catch(() => upload(onPage))
      .catch(() => (byId ? upload(byId) : Promise.reject(new Error('No file input found'))));

  try {
    await tryAll();
  } catch (_) {
    const uploadNewLabel = fieldset.getByText(/Upload\s+new/i).first();
    await uploadNewLabel.click({ timeout: 3000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 500));
    await tryAll();
  }
  return 'uploaded';
}

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
} as const;
