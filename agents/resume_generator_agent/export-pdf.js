/**
 * JSON Resume → file + PDF. Separate from content generation so we can
 * re-export after assistant or conversational edits without regenerating content.
 */
import { mkdirSync, writeFileSync, readFileSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname, basename as pathBasename } from 'path';
import { PATHS, ROOT } from '../../shared/config.js';

const DEFAULT_THEME = 'jsonresume-theme-even';

/**
 * Write resume JSON to a file and export to PDF via resumed.
 * @param {object} resumeJson - JSON Resume document
 * @param {{ outputDir?: string, jobSlug?: string, resumeBasename?: string, theme?: string }} [options]
 *   - resumeBasename: full basename (no extension), e.g. JohnDoe_SE_Acme_resume → JohnDoe_SE_Acme_resume.pdf
 *   - jobSlug: fallback when resumeBasename not set → resume-${jobSlug}.pdf
 * @returns {{ jsonPath: string, resumePath: string }} Paths to the .json and .pdf files
 */
export function exportResumeToPdf(resumeJson, options = {}) {
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

/**
 * Ensure PDF exists for a resume JSON file. If PDF already exists and is newer than JSON, return paths without re-exporting.
 * @param {string} jsonPath - Path to resume .json file
 * @param {{ outputDir?: string, theme?: string }} [options]
 * @returns {{ jsonPath: string, resumePath: string }}
 */
export function ensureResumePdfFromJsonFile(jsonPath, options = {}) {
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
  const resumeJson = JSON.parse(raw);
  return exportResumeToPdf(resumeJson, { outputDir: outDir, resumeBasename: base, theme });
}
