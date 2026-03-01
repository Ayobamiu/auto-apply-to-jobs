/**
 * Extract full JSON Resume from resume text using an LLM.
 * Use for "upload resume" flow; keeps extractProfileFromResumeText for profile-only (e.g. chat paste).
 */
import OpenAI from 'openai';
import { MAX_RESUME_CHARS } from './constants.js';

const DEFAULT_MODEL = 'gpt-4o-mini';
const SCHEMA_URL = 'https://raw.githubusercontent.com/jsonresume/resume-schema/master/schema.json';

const SYSTEM_PROMPT = `You are a precise resume parser. Convert raw resume text into a single JSON object that conforms to the JSON Resume schema (https://jsonresume.org/schema/).

STRICT RULES:
- Return ONLY valid JSON. No markdown, no explanation.
- Do NOT invent information. Extract only what is in the text.
- If a field is missing, omit it. Do NOT use null.
- Preserve original wording for titles, companies, bullet points.
- Dates: keep as written or use ISO8601-ish (e.g. "2024-01", "2024") where clear.
- Structure:
  - $schema: "${SCHEMA_URL}"
  - basics: { name (required), label/title, email?, phone?, url?, summary?, location?: { region? }, profiles?: [{ network, url }] }
  - work: array of { name (company), position, location?, startDate?, endDate?, summary?, highlights: string[] }
  - education: array of { institution (school), area (degree/subject), studyType?, startDate?, endDate? }
  - skills: array of { name (category), keywords: string[] }
  - projects?: array of { name, description?, highlights?: string[] }
- work[].highlights and education/skills must be arrays. Use empty arrays if none.`;

export interface ExtractResumeJsonOptions {
  apiKey?: string;
  model?: string;
  baseURL?: string;
}

/**
 * Extracts a full JSON Resume object from plain resume text.
 * Input is plain text; PDF-to-text is the caller's responsibility.
 */
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
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Convert the following resume text into a single JSON Resume object.\n\nResume text:\n"""\n${truncated}\n"""`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const raw = completion.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error('extractResumeJsonFromText: LLM returned empty response.');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    throw new Error(
      `extractResumeJsonFromText: LLM response was not valid JSON. ${(e as Error).message}`
    );
  }

  if (!parsed.basics || typeof parsed.basics !== 'object') {
    parsed.basics = { name: '', label: '' };
  }
  if (!parsed.$schema) {
    parsed.$schema = SCHEMA_URL;
  }
  if (!Array.isArray(parsed.work)) parsed.work = [];
  if (!Array.isArray(parsed.education)) parsed.education = [];
  if (!Array.isArray(parsed.skills)) parsed.skills = [];

  return parsed;
}
