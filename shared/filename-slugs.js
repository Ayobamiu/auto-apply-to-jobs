/**
 * Helpers for building consistent filenames: resume and job JSON.
 */

/** "Software Engineer" → "SE", "Junior Software Engineer" → "JSE" */
export function titleToInitials(title) {
  if (!title || typeof title !== 'string') return '';
  return title
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8) || '';
}

/** "John Doe" → "JohnDoe" (alphanumeric, no spaces) */
export function nameSlug(name) {
  if (!name || typeof name !== 'string') return 'resume';
  return name.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '') || 'resume';
}

/** "Clockwork Systems" → "ClockworkSystems" (alphanumeric, no spaces) */
export function companySlug(company) {
  if (!company || typeof company !== 'string') return 'company';
  return company.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '') || 'company';
}

/** Resume basename (no extension): <name>_<title initials>_<company>_resume */
export function resumeBasename(profile, job) {
  const name = nameSlug(profile?.name);
  const initials = titleToInitials(job?.title);
  const company = companySlug(job?.company);
  return [name, initials, company, 'resume'].filter(Boolean).join('_');
}

/** Job JSON basename (no extension): handshake_<title initials>_<company> */
export function jobJsonBasename(job) {
  const initials = titleToInitials(job?.title);
  const company = companySlug(job?.company);
  return ['handshake', initials, company].filter(Boolean).join('_');
}
