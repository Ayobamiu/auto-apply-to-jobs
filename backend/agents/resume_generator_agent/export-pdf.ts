/**
 * JSON Resume → file + PDF. Separate from content generation so we can re-export after edits.
 */
import { mkdirSync, writeFileSync, readFileSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname, basename as pathBasename } from 'path';
import { PATHS, ROOT } from '../../shared/config.js';

const DEFAULT_THEME = 'jsonresume-theme-even';

export interface ExportResumeOptions {
  outputDir?: string;
  jobSlug?: string;
  resumeBasename?: string;
  theme?: string;
}

export function exportResumeToPdf(
  resumeJson: Record<string, unknown>,
  options: ExportResumeOptions = {}
): { jsonPath: string; resumePath: string } {
  const outDir = options.outputDir ?? PATHS.resumes;
  const jobSlug = options.jobSlug ?? 'resume';
  const basename = options.resumeBasename ?? `resume-${jobSlug}`;
  const theme = options.theme ?? DEFAULT_THEME;

  try {
    mkdirSync(outDir, { recursive: true });
  } catch (_) {}

  const jsonPath = join(outDir, `${basename}.json`);
  const pdfPath = join(outDir, `${basename}.pdf`);

  writeFileSync(jsonPath, JSON.stringify(resumeJson, null, 2), 'utf8');

  try {
    execSync(`npx resumed export "${jsonPath}" -o "${pdfPath}" -t ${theme}`, {
      cwd: ROOT,
      stdio: 'inherit',
    });
  } catch (err) {
    console.error('Resumed PDF export failed. Ensure dependencies are installed: npm install resumed jsonresume-theme-even puppeteer');
    throw err;
  }

  return { jsonPath, resumePath: pdfPath };
}

export function ensureResumePdfFromJsonFile(
  jsonPath: string,
  options: { outputDir?: string; theme?: string } = {}
): { jsonPath: string; resumePath: string } {
  const outDir = options.outputDir ?? dirname(jsonPath);
  const theme = options.theme ?? DEFAULT_THEME;
  const base = pathBasename(jsonPath, '.json');
  const pdfPath = join(outDir, `${base}.pdf`);
  try {
    const jsonStat = statSync(jsonPath);
    const pdfStat = statSync(pdfPath);
    if (pdfStat.mtimeMs >= jsonStat.mtimeMs) {
      return { jsonPath, resumePath: pdfPath };
    }
  } catch (_) {}
  const raw = readFileSync(jsonPath, 'utf8');
  const resumeJson = JSON.parse(raw) as Record<string, unknown>;
  return exportResumeToPdf(resumeJson, { outputDir: outDir, resumeBasename: base, theme });
}
