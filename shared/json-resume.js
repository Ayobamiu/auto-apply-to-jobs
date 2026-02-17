/**
 * Map our profile (and optional job) to JSON Resume schema.
 * Schema: https://jsonresume.org/schema/
 */

const SCHEMA_URL = 'https://raw.githubusercontent.com/jsonresume/resume-schema/master/schema.json';

/** Parse "May 2025 – Sep 2025" or "2023 – 2025" or "2025" to { startDate, endDate } (ISO8601-ish). */
function parseDateRange(dates) {
  if (!dates || typeof dates !== 'string') return {};
  const s = dates.trim();
  const dash = s.includes('–') ? '–' : s.includes('-') ? '-' : null;
  if (!dash) {
    const year = s.match(/\d{4}/);
    return year ? { endDate: year[0] } : {};
  }
  const [startPart, endPart] = s.split(dash).map((x) => x.trim());
  const monthNames = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');
  const toIso = (part) => {
    const year = part.match(/\d{4}/)?.[0];
    if (!year) return null;
    const lower = part.toLowerCase();
    const mi = monthNames.findIndex((m) => lower.includes(m));
    if (mi >= 0) return `${year}-${String(mi + 1).padStart(2, '0')}`;
    return year;
  };
  const startDate = toIso(startPart);
  const endDate = toIso(endPart);
  return { startDate: startDate || undefined, endDate: endDate || undefined };
}

/**
 * @param {object} profile - Our profile (name, email, education, experience, skills, projects, ...)
 * @param {object} [job] - Optional job (title, company, description) for future tailoring
 * @returns {object} JSON Resume document
 */
export function profileToJsonResume(profile, job = {}) {
  const basics = {
    name: profile.name,
    label: profile.title || job.title || 'Software Engineer',
    email: profile.email || profile.contact?.email,
    phone: profile.phone || profile.contact?.phone,
    url: profile.github || profile.linkedin,
    summary: profile.summary,
    location: profile.location
      ? typeof profile.location === 'string'
        ? { region: profile.location }
        : profile.location
      : undefined,
    profiles: [],
  };
  if (profile.linkedin)
    basics.profiles.push({ network: 'LinkedIn', url: profile.linkedin });
  if (profile.github)
    basics.profiles.push({ network: 'GitHub', url: profile.github });
  if (!basics.profiles.length) delete basics.profiles;

  const work = (profile.experience || []).map((e) => {
    const { startDate, endDate } = parseDateRange(e.dates);
    return {
      name: e.company,
      position: e.title,
      location: e.location || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      summary: e.dates && !startDate && !endDate ? e.dates : undefined,
      highlights: e.bullets || [],
    };
  });

  const education = (profile.education || []).map((e) => {
    const year = e.year ? String(e.year).trim() : '';
    const degree = e.degree || '';
    const studyType = /M\.?S\.?|Master/i.test(degree) ? 'Master' : /B\.?S\.?|Bachelor/i.test(degree) ? 'Bachelor' : undefined;
    return {
      institution: e.school,
      area: e.degree,
      ...(studyType && { studyType }),
      endDate: year.match(/^\d{4}$/) ? year : undefined,
    };
  });

  const skills = [];
  if (profile.skills && typeof profile.skills === 'object') {
    for (const [name, keywords] of Object.entries(profile.skills)) {
      skills.push({ name, keywords: Array.isArray(keywords) ? keywords : [] });
    }
  }

  const projects = (profile.projects || []).map((p) => ({
    name: p.name,
    description: (p.bullets && p.bullets[0]) || undefined,
    highlights: p.bullets && p.bullets.length > 1 ? p.bullets.slice(1) : p.bullets || [],
  }));

  const out = {
    $schema: SCHEMA_URL,
    basics,
    work,
    education,
    skills,
    projects,
  };
  return out;
}
