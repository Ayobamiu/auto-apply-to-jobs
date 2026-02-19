/**
 * JSON Resume → file + PDF. Separate from content generation so we can
 * re-export after assistant or conversational edits without regenerating content.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
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
  const outDir = options.outputDir ?? PATHS.output;
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
