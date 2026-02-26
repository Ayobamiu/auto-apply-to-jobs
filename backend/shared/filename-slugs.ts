/**
 * Helpers for building consistent filenames: resume and job JSON.
 */
import type { Job, Profile } from './types.js';

/** "Software Engineer" → "SE", "Junior Software Engineer" → "JSE" */
export function titleToInitials(title: string | undefined): string {
  if (!title || typeof title !== 'string') return '';
  return (
    title
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 8) || ''
  );
}

/** "John Doe" → "JohnDoe" (alphanumeric, no spaces) */
export function nameSlug(name: string | undefined): string {
  if (!name || typeof name !== 'string') return 'resume';
  return name.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '') || 'resume';
}

/** "Clockwork Systems" → "ClockworkSystems" (alphanumeric, no spaces) */
export function companySlug(company: string | undefined): string {
  if (!company || typeof company !== 'string') return 'company';
  return company.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '') || 'company';
}

/** Resume basename (no extension): <name>_<title initials>_<company>_resume */
export function resumeBasename(profile: Profile | null | undefined, job: Job | null | undefined): string {
  const name = nameSlug(profile?.name);
  const initials = titleToInitials(job?.title);
  const company = companySlug(job?.company);
  return [name, initials, company, 'resume'].filter(Boolean).join('_');
}

/** Cover letter basename (no extension): <name>_<title initials>_<company>_cover */
export function coverLetterBasename(profile: Profile | null | undefined, job: Job | null | undefined): string {
  const name = nameSlug(profile?.name);
  const initials = titleToInitials(job?.title);
  const company = companySlug(job?.company);
  return [name, initials, company, 'cover'].filter(Boolean).join('_');
}

/** Job JSON basename (no extension): handshake_<title initials>_<company> */
export function jobJsonBasename(job: Job | null | undefined): string {
  const initials = titleToInitials(job?.title);
  const company = companySlug(job?.company);
  return ['handshake', initials, company].filter(Boolean).join('_');
}
