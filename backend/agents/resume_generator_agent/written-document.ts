/**
 * Written document generator: Employer instructions + Profile + Job -> plain text -> PDF.
 * Text stored in job_artifacts; PDF generated on demand via ensureWrittenDocumentPdfFromDb.
 */
import OpenAI from 'openai';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { getProfile } from '../../data/profile.js';
import { getPathsForUser } from '../../shared/config.js';
import {
  getWrittenDocumentForJob,
  getWrittenDocumentForJobArtifact,
  saveWrittenDocumentForJob,
  type WrittenDocumentContent,
} from '../../data/job-artifacts.js';
import { PATHS } from '../../shared/config.js';
import { AppError, CODES } from '../../shared/errors.js';
import { chromium } from 'playwright';
import type { Profile, Job } from '../../shared/types.js';

const DEFAULT_MODEL = 'gpt-4o-mini';

const SYSTEM_PROMPT = `You are a professional application writer helping a candidate respond to employer-provided prompts for a job application.

RULES:
- Read the employer's instructions carefully and respond directly to each question or prompt.
- Use the candidate's profile and the job description to craft a relevant, authentic response.
- Keep the tone professional yet personable — show genuine interest and personality.
- Be concise but thorough (150-500 words depending on the complexity of the prompt).
- If the prompt asks multiple questions, address each one clearly.
- Output ONLY the response text. No JSON, no markdown formatting, no explanation.
- Do not repeat the questions — just answer them.`;

export interface GenerateWrittenDocumentOptions {
  profile?: Profile;
  job: Job;
  userId?: string;
  instructions: string;
  artifactId?: string | null;
  apiKey?: string;
  model?: string;
  outputDir?: string;
  forceRegenerate?: boolean;
}

export async function generateWrittenDocument(
  options: GenerateWrittenDocumentOptions
): Promise<{ docPath: string }> {
  const userId = options.userId ?? 'default';
  const profile = options.profile ?? (await getProfile(userId));
  const job = options.job;
  const site = job?.site;
  const jobId = job?.jobId;
  const artifactId = options.artifactId;
  if (!artifactId) {
    throw new Error('Written document generator requires artifactId.');
  }

  if (site && jobId) {
    // If we have a specific artifact, check that first; otherwise fall back to any existing doc.
    const existingForField = await getWrittenDocumentForJobArtifact(userId, site, jobId, artifactId);
    if (existingForField && !options.forceRegenerate) {
      return ensureWrittenDocumentPdfFromDbForArtifact(userId, site, jobId, artifactId, { profile, job });
    }
  }

  const key = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('Written document generator requires OPENAI_API_KEY.');
  }

  const client = new OpenAI({ apiKey: key });
  const model = options.model ?? DEFAULT_MODEL;

  const jobBlock = [
    job?.title && `Title: ${job.title}`,
    job?.company && `Company: ${job.company}`,
    job?.description && `Description:\n${job.description.slice(0, 6000)}`,
  ].filter(Boolean).join('\n');

  const profileBlock = JSON.stringify(profile, null, 2);

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Write a response for this candidate applying to the following job.\n\n## Employer Instructions\n${options.instructions}\n\n## Candidate profile\n${profileBlock}\n\n## Job\n${jobBlock}`,
      },
    ],
    temperature: 0.4,
  });

  const text = completion.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error('Written document generator received empty response from LLM.');
  }

  if (site && jobId && artifactId && artifactId !== null) {
    const payload: WrittenDocumentContent = {
      text,
      instructions: options.instructions,
    };
    await saveWrittenDocumentForJob(userId, site, jobId, artifactId, payload);
    return ensureWrittenDocumentPdfFromDbForArtifact(userId, site, jobId, artifactId, { profile, job });
  }

  const outDir = options.outputDir ?? getPathsForUser(userId).resumesDir;
  const basename = writtenDocBasename(profile, job);
  const pdfPath = join(outDir, `${basename}.pdf`);
  mkdirSync(outDir, { recursive: true });

  await renderTextToPdf(text, pdfPath);
  console.log(`Written document generated: ${pdfPath}`);
  return { docPath: pdfPath };
}

function writtenDocBasename(profile?: Profile | null, job?: Job | null): string {
  const parts: string[] = [];
  if (profile?.name) parts.push(profile.name.replace(/[^a-zA-Z0-9]/g, '_'));
  if (job?.company) parts.push(job.company.replace(/[^a-zA-Z0-9]/g, '_'));
  parts.push('written_doc');
  return parts.join('_').replace(/_+/g, '_').slice(0, 80) || 'written_document';
}

export interface EnsureWrittenDocumentPdfOptions {
  outputDir?: string;
  profile?: Profile | null;
  job?: Job | null;
}

export async function ensureWrittenDocumentPdfFromDbForArtifact(
  userId: string,
  site: string,
  jobId: string,
  artifactId: string,
  options: EnsureWrittenDocumentPdfOptions = {},
): Promise<{ docPath: string }> {
  const content = await getWrittenDocumentForJobArtifact(userId, site, jobId, artifactId);
  if (!content) {
    throw new AppError(CODES.PREFLIGHT_FAILED, 'No written document for this job and artifact. Generate one first.');
  }
  const profile = options.profile ?? (await getProfile(userId));
  const { getJob } = await import('../../data/jobs.js');
  const job = options.job ?? (await getJob(site, jobId));
  const base = writtenDocBasename(profile, job ?? undefined);
  const outDir =
    options.outputDir ?? join(PATHS.output, 'resumes', userId.replace(/[^a-zA-Z0-9_-]/g, '_'));
  mkdirSync(outDir, { recursive: true });
  const pdfPath = join(outDir, `${base}.pdf`);

  await renderTextToPdf(content.text, pdfPath);
  return { docPath: pdfPath };
}

async function renderTextToPdf(text: string, pdfPath: string): Promise<void> {
  const paragraphs = text.split('\n').map((line) =>
    line.trim() ? `<p>${line}</p>` : '<br>'
  ).join('\n');
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: Georgia, serif; max-width: 700px; margin: 40px auto; padding: 20px; line-height: 1.6; color: #333; font-size: 12pt; }
  p { margin: 0 0 1em; }
</style></head><body>${paragraphs}</body></html>`;

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
}
