/**
 * Handshake apply modal: for each attachment, try to select by name first; if not found, upload new.
 */
import { basename } from 'path';
import type { Page, Locator } from 'playwright';
import {
  SEARCH_INPUT_TIMEOUT_MS,
  SEARCH_RESULT_TIMEOUT_MS,
  FILE_UPLOAD_TIMEOUT_MS,
  UPLOAD_NEW_LABEL_TIMEOUT_MS,
  SECTION_DETECT_TIMEOUT_MS,
  POST_SEARCH_FILL_DELAY_MS,
  POST_UPLOAD_CLICK_DELAY_MS,
} from './constants.js';
import type { AttachSectionOptions, PresentSectionConfig, SectionKey } from './types.js';

export type { AttachSectionOptions, PresentSectionConfig, SectionKey } from './types.js';

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
    await searchInput.click({ timeout: SEARCH_INPUT_TIMEOUT_MS });
    await searchInput.fill(fileNameForSearch);
    await new Promise((r) => setTimeout(r, POST_SEARCH_FILL_DELAY_MS));

    const listbox = page.getByRole('listbox').first();
    const option = listbox.getByRole('option').filter({ hasText: fileNameForSearch }).first();
    await option.waitFor({ state: 'visible', timeout: SEARCH_RESULT_TIMEOUT_MS });
    await option.click();
    return 'selected';
  } catch (_) { }

  const upload = async (inputLocator: Locator) => {
    await inputLocator.setInputFiles(filePath, { timeout: FILE_UPLOAD_TIMEOUT_MS });
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
    await uploadNewLabel.click({ timeout: UPLOAD_NEW_LABEL_TIMEOUT_MS }).catch(() => { });
    await new Promise((r) => setTimeout(r, POST_UPLOAD_CLICK_DELAY_MS));
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

export async function getPresentSectionConfigs(
  page: Page,
  modal: Locator,
  options?: { timeout?: number }
): Promise<PresentSectionConfig[]> {
  const timeout = options?.timeout ?? SECTION_DETECT_TIMEOUT_MS;
  const result: PresentSectionConfig[] = [];
  for (const key of Object.keys(SECTION_CONFIG) as SectionKey[]) {
    const config = SECTION_CONFIG[key];
    const fieldset = modal
      .locator('fieldset')
      .filter({
        has: page.getByRole('heading', { name: new RegExp(config.sectionHeading, 'i') }),
      })
      .first();
    try {
      await fieldset.waitFor({ state: 'visible', timeout });
      result.push({ key, ...config });
    } catch (_) {
      // section not present, skip
    }
  }
  return result;
}
