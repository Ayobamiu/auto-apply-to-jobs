/**
 * Map our profile (and optional job) to JSON Resume schema.
 */
import type { Profile, Job } from './types.js';

const SCHEMA_URL = 'https://raw.githubusercontent.com/jsonresume/resume-schema/master/schema.json';

function parseDateRange(dates: string | undefined): { startDate?: string; endDate?: string } {
  if (!dates || typeof dates !== 'string') return {};
  const s = dates.trim();
  const dash = s.includes('–') ? '–' : s.includes('-') ? '-' : null;
  if (!dash) {
    const year = s.match(/\d{4}/);
    return year ? { endDate: year[0] } : {};
  }
  const [startPart, endPart] = s.split(dash).map((x) => x.trim());
  const monthNames = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');
  const toIso = (part: string): string | null => {
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

interface ExperienceEntry {
  company?: string;
  title?: string;
  location?: string;
  dates?: string;
  bullets?: string[];
}

interface EducationEntry {
  school?: string;
  degree?: string;
  year?: string | number;
}

interface ProjectEntry {
  name?: string;
  bullets?: string[];
}

export function profileToJsonResume(profile: Profile & { contact?: { email?: string; phone?: string }; github?: string; title?: string; location?: string | { region?: string } }, job: Job = {}): Record<string, unknown> {
  const basics: Record<string, unknown> = {
    name: profile.name,
    label: (profile as { title?: string }).title || job.title || 'Software Engineer',
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
  const profiles = basics.profiles as Array<{ network: string; url: string }>;
  if (profile.linkedin) profiles.push({ network: 'LinkedIn', url: profile.linkedin });
  if (profile.github) profiles.push({ network: 'GitHub', url: profile.github });
  if (!profiles.length) delete basics.profiles;

  const work = ((profile.experience || []) as ExperienceEntry[]).map((e) => {
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

  const education = ((profile.education || []) as EducationEntry[]).map((e) => {
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

  const skills: Array<{ name: string; keywords: string[] }> = [];
  if (profile.skills && typeof profile.skills === 'object') {
    for (const [name, keywords] of Object.entries(profile.skills)) {
      skills.push({ name, keywords: Array.isArray(keywords) ? keywords : [] });
    }
  }

  const projects = ((profile.projects || []) as ProjectEntry[]).map((p) => ({
    name: p.name,
    description: (p.bullets && p.bullets[0]) || undefined,
    highlights: p.bullets && p.bullets.length > 1 ? p.bullets.slice(1) : p.bullets || [],
  }));

  return {
    $schema: SCHEMA_URL,
    basics,
    work,
    education,
    skills,
    projects,
  };
}
