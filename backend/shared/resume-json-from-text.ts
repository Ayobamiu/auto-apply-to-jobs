/**
 * Extract full JSON Resume from resume text using an LLM.
 * Use for "upload resume" flow; keeps extractProfileFromResumeText for profile-only (e.g. chat paste).
 */
import OpenAI from 'openai';
import { MAX_RESUME_CHARS } from './constants.js';
import { resume_from_text_or_pdf_response_format, resume_from_text_or_pdf_system_prompt } from './prompts/resume.js';

const DEFAULT_MODEL = 'gpt-4o-mini';

export interface ExtractResumeJsonOptions {
  apiKey?: string;
  model?: string;
  baseURL?: string;
}
export async function extractResumeJsonFromText(
  resumeText: string,
  options?: ExtractResumeJsonOptions
): Promise<Record<string, unknown>> {
  const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('extractResumeJsonFromText requires OPENAI_API_KEY (or pass apiKey in options).');
  }

  const openaiOptions: { apiKey: string; baseURL?: string } = { apiKey };
  if (options?.baseURL) openaiOptions.baseURL = options.baseURL;
  const client = new OpenAI(openaiOptions);
  const model = options?.model ?? DEFAULT_MODEL;

  const truncated =
    resumeText.length > MAX_RESUME_CHARS
      ? resumeText.slice(0, MAX_RESUME_CHARS) + '\n\n[Truncated...]'
      : resumeText;

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: resume_from_text_or_pdf_system_prompt },
      {
        role: 'user',
        content: `Convert the following resume text into a single JSON Resume object.\n\nResume text:\n"""\n${truncated}\n"""`,
      },
    ],
    response_format: resume_from_text_or_pdf_response_format,
    temperature: 0.2,
  });

  const raw = completion.choices[0].message.content;
  if (!raw) {
    throw new Error('extractResumeJsonFromText: LLM returned empty response.');
  }

  return JSON.parse(raw) as Record<string, unknown>;
}