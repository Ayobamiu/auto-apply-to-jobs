/**
 * JSON Resume → PDF via Playwright.
 * Renders the resume using a self-contained HTML page with the same styles as ResumeDocument,
 * then prints to PDF for pixel-perfect output.
 */
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { PATHS, ROOT } from '../../shared/config.js';
import { getResumeForJob } from '../../data/job-artifacts.js';
import { getProfile } from '../../data/profile.js';
import { getJob } from '../../data/jobs.js';
import { resumeBasename } from '../../shared/filename-slugs.js';
import { AppError, CODES } from '../../shared/errors.js';

export type { ExportResumeOptions, EnsureResumePdfFromDbOptions } from '../../shared/types.js';
import type { ExportResumeOptions, EnsureResumePdfFromDbOptions } from '../../shared/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = join(__dirname, '..', '..', '..', 'frontend', 'dist');

function getBuiltCss(): string {
  try {
    const { readdirSync } = require('fs');
    const assetsDir = join(FRONTEND_DIST, 'assets');
    const cssFiles = readdirSync(assetsDir).filter((f: string) => f.endsWith('.css'));
    if (cssFiles.length > 0) {
      return readFileSync(join(assetsDir, cssFiles[0]), 'utf8');
    }
  } catch { }
  return '';
}

function buildResumeHtml(resumeJson: Record<string, unknown>): string {
  const css = getBuiltCss();
  const basics = (resumeJson.basics as Record<string, unknown>) ?? {};
  const location = (basics.location as Record<string, unknown>) ?? {};
  const work = (Array.isArray(resumeJson.work) ? resumeJson.work : []) as Record<string, unknown>[];
  const education = (Array.isArray(resumeJson.education) ? resumeJson.education : []) as Record<string, unknown>[];
  const skills = (Array.isArray(resumeJson.skills) ? resumeJson.skills : []) as Record<string, unknown>[];
  const projects = (Array.isArray(resumeJson.projects) ? resumeJson.projects : []) as Record<string, unknown>[];
  const volunteer = (Array.isArray(resumeJson.volunteer) ? resumeJson.volunteer : []) as Record<string, unknown>[];
  const languages = (Array.isArray(resumeJson.languages) ? resumeJson.languages : []) as Record<string, unknown>[];
  const certificates = (Array.isArray(resumeJson.certificates) ? resumeJson.certificates : []) as Record<string, unknown>[];
  const awards = (Array.isArray(resumeJson.awards) ? resumeJson.awards : []) as Record<string, unknown>[];

  const s = (obj: Record<string, unknown>, key: string) => (typeof obj[key] === 'string' ? obj[key] as string : '');
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const dateRange = (start: string, end: string) => start ? start + ' – ' + (end || 'Present') : '';

  const sep = '<span style="color:#9ca3af;margin:0 4px">|</span>';

  let html = '';

  // Header
  const name = s(basics, 'name');
  const label = s(basics, 'label');
  const email = s(basics, 'email');
  const phone = s(basics, 'phone');
  const url = s(basics, 'url');
  const city = s(location, 'city');
  const region = s(location, 'region');
  const locStr = [city, region].filter(Boolean).join(', ');
  const summary = s(basics, 'summary');
  const profiles = (basics.profiles as Record<string, unknown>[]) ?? [];

  html += `<header style="text-align:center;margin-bottom:16px">`;
  if (name) html += `<h1 style="font-size:20px;font-weight:700;margin:0">${esc(name)}</h1>`;
  if (label && !summary) html += `<p style="font-size:13px;color:#6b7280;margin:2px 0">${esc(label)}</p>`;

  const profileParts = profiles.map(p => {
    const network = s(p as Record<string, unknown>, 'network');
    const profileUrl = s(p as Record<string, unknown>, 'url').replace('https://', '').replace('http://', '');
    return network && profileUrl ? `${esc(network)}: ${esc(profileUrl)}` : esc(profileUrl);
  }).filter(Boolean);

  // contactParts items from locStr/phone/email are plain strings; profileParts and url are already escaped above,
  // so we build the list before the final .map(esc) for those. Let's fix the double-escape risk:
  const contactParts: string[] = [
    locStr ? esc(locStr) : '',
    phone ? esc(phone) : '',
    email ? esc(email) : '',
    url ? `Website: ${esc(url.replace('https://', '').replace('http://', ''))}` : '',
    ...profileParts,
  ].filter(Boolean);

  if (contactParts.length) html += `<p style="font-size:12px;color:#6b7280;margin:2px 0">${contactParts.join(' &#124; ')}</p>`;
  html += `</header>`;

  if (summary) html += `<section style="margin-bottom:12px"><h2 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e5e7eb;padding-bottom:2px;margin-bottom:6px">${esc(label) || 'Profile'}</h2><p style="font-size:12px;color:#374151;line-height:1.5">${esc(summary)}</p></section>`;

  // Work
  if (work.length) {
    html += `<section style="margin-bottom:12px"><h2 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e5e7eb;padding-bottom:2px;margin-bottom:6px">Experience</h2>`;
    for (const w of work) {
      const highlights = Array.isArray(w.highlights) ? (w.highlights as string[]).filter(Boolean) : [];
      const workSummary = s(w, 'summary');
      const range = dateRange(s(w, 'startDate'), s(w, 'endDate'));
      html += `<div style="margin-bottom:8px"><p style="font-size:12px"><span style="color:#374151">${esc(s(w, 'position'))}</span>${s(w, 'position') && s(w, 'name') ? sep : ''}<span style="font-weight:600">${esc(s(w, 'name'))}</span>${s(w, 'location') ? sep + '<span style="color:#6b7280">' + esc(s(w, 'location')) + '</span>' : ''}${range ? sep + '<span style="color:#6b7280">' + esc(range) + '</span>' : ''}</p>`;
      if (workSummary) html += `<p style="font-size:12px;color:#374151;margin:2px 0">${esc(workSummary)}</p>`;
      if (highlights.length) {
        html += `<ul style="font-size:12px;color:#374151;margin:2px 0 0 16px;padding:0;list-style:disc">`;
        for (const h of highlights) html += `<li style="margin-bottom:2px">${esc(h)}</li>`;
        html += `</ul>`;
      }
      html += `</div>`;
    }
    html += `</section>`;
  }

  // Education
  if (education.length) {
    html += `<section style="margin-bottom:12px"><h2 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e5e7eb;padding-bottom:2px;margin-bottom:6px">Education</h2>`;
    for (const e of education) {
      const range = dateRange(s(e, 'startDate'), s(e, 'endDate'));
      const score = s(e, 'score');
      const courses = Array.isArray(e.courses) ? (e.courses as string[]).filter(Boolean) : [];
      html += `<div style="margin-bottom:6px">`;
      html += `<p style="font-size:12px;font-weight:600">${esc(s(e, 'institution'))}</p>`;
      html += `<p style="font-size:12px;color:#4b5563">${[s(e, 'studyType'), s(e, 'area')].filter(Boolean).join(', ')}${range ? ' · ' + range : ''}${score ? ' · GPA: ' + esc(score) : ''}</p>`;
      if (courses.length) html += `<p style="font-size:12px;color:#6b7280;margin-top:2px">Courses: ${courses.map(esc).join(', ')}</p>`;
      html += `</div>`;
    }
    html += `</section>`;
  }

  // Projects
  if (projects.length) {
    html += `<section style="margin-bottom:12px"><h2 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e5e7eb;padding-bottom:2px;margin-bottom:6px">Projects</h2>`;
    for (const p of projects) {
      const highlights = Array.isArray(p.highlights) ? (p.highlights as string[]).filter(Boolean) : [];
      const projectDesc = s(p, 'description');
      const projectUrl = s(p, 'url');
      html += `<div style="margin-bottom:6px">`;
      html += `<p style="font-size:12px;font-weight:600">${esc(s(p, 'name'))}${projectUrl ? ' <span style="font-weight:400;color:#6b7280">— ' + esc(projectUrl.replace('https://', '').replace('http://', '')) + '</span>' : ''}</p>`;
      if (projectDesc) html += `<p style="font-size:12px;color:#4b5563;margin-top:1px">${esc(projectDesc)}</p>`;
      if (highlights.length) {
        html += `<ul style="font-size:12px;color:#374151;margin:2px 0 0 16px;padding:0;list-style:disc">`;
        for (const h of highlights) html += `<li style="margin-bottom:2px">${esc(h)}</li>`;
        html += `</ul>`;
      }
      html += `</div>`;
    }
    html += `</section>`;
  }

  // Skills
  if (skills.length) {
    html += `<section style="margin-bottom:12px"><h2 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e5e7eb;padding-bottom:2px;margin-bottom:6px">Skills</h2>`;
    for (const sk of skills) {
      const kws = Array.isArray(sk.keywords) ? (sk.keywords as string[]).filter(Boolean) : [];
      html += `<div style="margin-bottom:4px;font-size:12px"><span style="font-weight:600">${esc(s(sk, 'name'))}</span>${kws.length ? ': ' + kws.map(esc).join(', ') : ''}</div>`;
    }
    html += `</section>`;
  }

  // Volunteer
  if (volunteer.length) {
    html += `<section style="margin-bottom:12px"><h2 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e5e7eb;padding-bottom:2px;margin-bottom:6px">Volunteer</h2>`;
    for (const v of volunteer) {
      const highlights = Array.isArray(v.highlights) ? (v.highlights as string[]).filter(Boolean) : [];
      const range = dateRange(s(v, 'startDate'), s(v, 'endDate'));
      html += `<div style="margin-bottom:6px"><p style="font-size:12px"><span>${esc(s(v, 'position'))}</span>${s(v, 'organization') ? sep + '<span style="font-weight:600">' + esc(s(v, 'organization')) + '</span>' : ''}${range ? sep + '<span style="color:#6b7280">' + esc(range) + '</span>' : ''}</p>`;
      if (highlights.length) {
        html += `<ul style="font-size:12px;color:#374151;margin:2px 0 0 16px;padding:0;list-style:disc">`;
        for (const h of highlights) html += `<li style="margin-bottom:2px">${esc(h)}</li>`;
        html += `</ul>`;
      }
      html += `</div>`;
    }
    html += `</section>`;
  }

  // Languages
  if (languages.length) {
    html += `<section style="margin-bottom:12px"><h2 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e5e7eb;padding-bottom:2px;margin-bottom:6px">Languages</h2>`;
    for (const l of languages) {
      html += `<div style="font-size:12px;margin-bottom:2px">${esc(s(l, 'language'))} — ${esc(s(l, 'fluency'))}</div>`;
    }
    html += `</section>`;
  }

  // Certificates
  if (certificates.length) {
    html += `<section style="margin-bottom:12px"><h2 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e5e7eb;padding-bottom:2px;margin-bottom:6px">Certificates</h2>`;
    for (const c of certificates) {
      html += `<div style="font-size:12px;margin-bottom:4px"><span style="font-weight:600">${esc(s(c, 'name'))}</span>${s(c, 'issuer') ? ' — ' + esc(s(c, 'issuer')) : ''}${s(c, 'date') ? ' (' + esc(s(c, 'date')) + ')' : ''}</div>`;
    }
    html += `</section>`;
  }

  // Awards
  if (awards.length) {
    html += `<section style="margin-bottom:12px"><h2 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e5e7eb;padding-bottom:2px;margin-bottom:6px">Awards</h2>`;
    for (const a of awards) {
      html += `<div style="font-size:12px;margin-bottom:4px"><span style="font-weight:600">${esc(s(a, 'title'))}</span>${s(a, 'awarder') ? ' — ' + esc(s(a, 'awarder')) : ''}${s(a, 'date') ? ' (' + esc(s(a, 'date')) + ')' : ''}`;
      if (s(a, 'summary')) html += `<p style="color:#374151;margin-top:1px">${esc(s(a, 'summary'))}</p>`;
      html += `</div>`;
    }
    html += `</section>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif; max-width: 720px; margin: 0 auto; padding: 20px 30px; line-height: 1.4; color: #1f2937; font-size: 12px; }
    h1 { font-size: 20px; } h2 { font-size: 13px; }
    ${css ? '/* built CSS available but using inline styles for reliability */' : ''}
  </style></head><body>${html}</body></html>`;
}


async function renderHtmlToPdf(html: string, pdfPath: string): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.pdf({
      path: pdfPath,
      format: 'Letter',
      margin: { top: '0.5in', bottom: '0.5in', left: '0.6in', right: '0.6in' },
      printBackground: true,
    });
  } finally {
    await browser.close();
  }
}

export function exportResumeToPdf(
  resumeJson: Record<string, unknown>,
  options: ExportResumeOptions = {}
): { jsonPath: string; resumePath: string } {
  const outDir = options.outputDir ?? PATHS.resumes;
  const jobSlug = options.jobSlug ?? 'resume';
  const base = options.resumeBasename ?? `resume-${jobSlug}`;

  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, `${base}.json`);
  const pdfPath = join(outDir, `${base}.pdf`);

  writeFileSync(jsonPath, JSON.stringify(resumeJson, null, 2), 'utf8');

  const html = buildResumeHtml(resumeJson);
  // Sync wrapper — launches Playwright. For pipeline usage this runs in a worker.
  const { execSync } = require('child_process');
  const tempHtml = join(tmpdir(), `auto-apply-${randomUUID()}.html`);
  const tempScript = join(tmpdir(), `auto-apply-pdf-${randomUUID()}.mjs`);
  writeFileSync(tempHtml, html, 'utf8');
  writeFileSync(tempScript, `
    import { chromium } from 'playwright';
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('file://${tempHtml.replace(/\\/g, '/')}', { waitUntil: 'networkidle' });
    await page.pdf({ path: '${pdfPath.replace(/\\/g, '/')}', format: 'Letter', margin: { top: '0.5in', bottom: '0.5in', left: '0.6in', right: '0.6in' }, printBackground: true });
    await browser.close();
  `, 'utf8');
  try {
    execSync(`node "${tempScript}"`, { cwd: ROOT, stdio: 'inherit' });
  } catch (err) {
    console.error('Playwright PDF export failed:', err);
    throw err;
  } finally {
    try { unlinkSync(tempHtml); } catch { }
    try { unlinkSync(tempScript); } catch { }
  }

  return { jsonPath, resumePath: pdfPath };
}

export async function ensureResumePdfFromDb(
  userId: string,
  site: string,
  jobId: string,
  options: EnsureResumePdfFromDbOptions = {}
): Promise<{ resumePath: string }> {
  const resumeJson = await getResumeForJob(userId, site, jobId);
  if (!resumeJson) throw new AppError(CODES.NO_RESUME);

  const profile = options.profile ?? (await getProfile(userId));
  const job = options.job ?? (await getJob(site, jobId));
  const base = resumeBasename(profile, job) || 'resume';
  const outDir = options.outputDir ?? join(PATHS.output, 'resumes', userId.replace(/[^a-zA-Z0-9_-]/g, '_'));
  mkdirSync(outDir, { recursive: true });
  const pdfPath = join(outDir, `${base}.pdf`);

  const html = buildResumeHtml(resumeJson);
  await renderHtmlToPdf(html, pdfPath);
  return { resumePath: pdfPath };
}
