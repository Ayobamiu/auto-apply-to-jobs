/**
 * Cover letter generator: Profile + Job -> plain text -> PDF.
 */
import OpenAI from 'openai';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { getProfile } from '../../data/profile.js';
import { getPathsForUser } from '../../shared/config.js';
import { coverLetterBasename } from '../../shared/filename-slugs.js';
import type { Profile, Job } from '../../shared/types.js';

const DEFAULT_MODEL = 'gpt-4o-mini';

const SYSTEM_PROMPT = `You are a professional cover letter writer. Write a concise, compelling cover letter (250-400 words) tailored to the job.

RULES:
- Address it to "Hiring Manager" unless the posting names someone specific.
- Open with enthusiasm for the specific role and company.
- Highlight 2-3 relevant experiences/skills from the candidate's profile that match the job.
- Close with a call to action and professional sign-off.
- Output ONLY the cover letter text. No JSON, no markdown formatting, no explanation.
- Use the candidate's real name for the sign-off.`;

export interface GenerateCoverLetterOptions {
  profile?: Profile;
  job: Job;
  userId?: string;
  apiKey?: string;
  model?: string;
  outputDir?: string;
  forceRegenerate?: boolean;
}

export async function generateCoverLetter(options: GenerateCoverLetterOptions): Promise<{ coverPath: string }> {
  const userId = options.userId ?? 'default';
  const profile = options.profile ?? (await getProfile(userId));
  const outDir = options.outputDir ?? getPathsForUser(userId).resumesDir;
  const basename = coverLetterBasename(profile, options.job);

  const pdfPath = join(outDir, `${basename}.pdf`);
  if (existsSync(pdfPath) && !options.forceRegenerate) {
    console.log('Cover letter already exists, skipping generation:', pdfPath);
    return { coverPath: pdfPath };
  }

  const key = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('Cover letter generator requires OPENAI_API_KEY.');
  }

  const client = new OpenAI({ apiKey: key });
  const model = options.model ?? DEFAULT_MODEL;

  const jobBlock = [
    options.job.title && `Title: ${options.job.title}`,
    options.job.company && `Company: ${options.job.company}`,
    options.job.description && `Description:\n${options.job.description.slice(0, 6000)}`,
  ].filter(Boolean).join('\n');

  const profileBlock = JSON.stringify(profile, null, 2);

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Write a cover letter for this candidate applying to the following job.\n\n## Candidate profile\n${profileBlock}\n\n## Job\n${jobBlock}`,
      },
    ],
    temperature: 0.4,
  });

  const text = completion.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error('Cover letter generator received empty response from LLM.');
  }

  mkdirSync(outDir, { recursive: true });

  const paragraphs = text.split('\n').map((line) =>
    line.trim() ? `<p>${line}</p>` : '<br>'
  ).join('\n');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: Georgia, serif; max-width: 700px; margin: 40px auto; padding: 20px; line-height: 1.6; color: #333; font-size: 12pt; }
  p { margin: 0 0 1em; }
</style></head><body>${paragraphs}</body></html>`;

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.pdf({
      path: pdfPath,
      format: 'Letter',
      margin: { top: '0.75in', bottom: '0.75in', left: '1in', right: '1in' },
    });
  } finally {
    await browser.close();
  }

  console.log(`Cover letter generated: ${pdfPath}`);
  return { coverPath: pdfPath };
}
