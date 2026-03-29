/**
 * Site adapter registry: maps site names to SiteFormExtractor implementations.
 * New job sites are added by implementing SiteFormExtractor and registering here.
 */
import type { Page, Locator } from 'playwright';
import type { SiteFormExtractor, SiteFormExtractorResult, ClassifiedField, GeneratedAnswer } from '../types.js';
import { extractHandshakeForm } from './handshake-extractor.js';
import { fillDynamicFields } from './handshake-form-filler.js';
import { GreenhouseSiteFormExtractor } from '../../greenhouse/extractor.js';

const handshakeAdapter: SiteFormExtractor = {
  site: 'handshake',
  async extractForm(page: unknown, modalLocator: unknown, jobRef: string): Promise<SiteFormExtractorResult> {
    return extractHandshakeForm(page as Page, modalLocator as Locator, jobRef);
  },
  async fillForm(
    page: unknown,
    modalLocator: unknown,
    fields: ClassifiedField[],
    answers: GeneratedAnswer[],
  ) {
    return fillDynamicFields(page as Page, modalLocator as Locator, fields, answers);
  },
};

const registry = new Map<string, SiteFormExtractor>();
registry.set('handshake', handshakeAdapter);
registry.set('greenhouse', GreenhouseSiteFormExtractor);

export function getSiteAdapter(site: string): SiteFormExtractor | undefined {
  return registry.get(site);
}

export function registerSiteAdapter(adapter: SiteFormExtractor): void {
  registry.set(adapter.site, adapter);
}

export function listRegisteredSites(): string[] {
  return Array.from(registry.keys());
}
