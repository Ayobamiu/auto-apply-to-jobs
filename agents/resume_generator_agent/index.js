/**
 * Resume generator agent: Profile + Job → tailored resume file.
 * Input: profile (from shared), job (from shared or passed in).
 * Output: { resumePath } (and optionally coverLetterPath later).
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { loadProfile } from '../../shared/profile.js';
import { loadJob } from '../../shared/job.js';
import { PATHS } from '../../shared/config.js';

function slug(str) {
  return (str || 'job').replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '').toLowerCase().slice(0, 40);
}

function buildResumeMd(profile, job) {
  const lines = [
    `# ${profile.name}`,
    '',
    [profile.email, profile.phone, profile.linkedin].filter(Boolean).join(' · '),
    '',
    '## Summary',
    profile.summary || 'Professional summary.',
    '',
    '## Education',
    ...(profile.education || []).flatMap((e) => [
      `**${e.school}** — ${e.degree}${e.year ? ` (${e.year})` : ''}`,
      '',
    ]),
    '## Experience',
    ...(profile.experience || []).flatMap((e) => [
      `**${e.title}** at ${e.company}${e.dates ? ` · ${e.dates}` : ''}`,
      ...(e.bullets || []).map((b) => `- ${b}`),
      '',
    ]),
    '## Skills',
    Object.entries(profile.skills || {}).map(([category, skills]) => [
      `**${category}**`,
      ...(skills || []).map((skill) => `- ${skill}`),
      '',
    ]).join('\n'),
    '',
  ];
  return lines.join('\n');
}

export function runResumeGenerator(options = {}) {
  const profile = options.profile ?? loadProfile(options.profilePath);
  const job = options.job ?? loadJob(options.jobPath);
  const outDir = options.outputDir ?? PATHS.output;
  const jobSlug = slug(job.title || job.company || 'job');

  try {
    mkdirSync(outDir, { recursive: true });
  } catch (_) { }

  const resumePath = join(outDir, `resume-${jobSlug}.md`);
  const content = buildResumeMd(profile, job);
  writeFileSync(resumePath, content, 'utf8');

  return { resumePath };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runResumeGenerator();
  console.log('Generated:', result.resumePath);
}
