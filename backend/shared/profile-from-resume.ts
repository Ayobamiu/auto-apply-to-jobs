/**
 * Extract a structured Profile from resume text using an LLM.
 * Callers provide plain text (e.g. from a PDF parser or pasted content).
 */
import OpenAI from 'openai';
import type { Profile, EducationEntry, ExperienceEntry } from './types.js';
import PROFILE_SCHEMA_JSON from './profile_schema.json' with { type: "json" };

const PROFILE_SCHEMA = (PROFILE_SCHEMA_JSON as { name: string; schema: Record<string, unknown> })
  .schema;

import { MAX_RESUME_CHARS } from './constants.js';

const DEFAULT_MODEL = 'gpt-4o-mini';

const SYSTEM_PROMPT = `You are a precise resume parser.

Extract structured profile information from raw resume text.

STRICT RULES:
- Return ONLY valid JSON matching the provided schema.
- Do NOT invent information.
- If a field is missing, omit it.
- Do NOT use null values.
- Do NOT add explanations.
- Preserve original wording for titles, companies, and bullet points.
- Normalize obvious formatting issues (extra spaces, broken lines).
- Dates should remain as written (do not infer).
- If multiple education or experience entries exist, extract all of them.
- Bullets must be arrays of strings.
- Skills must be an array of objects, each with "category" (string) and "keywords" (array of strings). Choose category names that fit the resume: for technical resumes use labels like "Languages & Frameworks", "Backend", "Tools"; for other fields use relevant labels like "Leadership", "Clinical Skills", "Languages", "Certifications", etc.`;

export interface ExtractProfileFromResumeOptions {
  apiKey?: string;
  model?: string;
  baseURL?: string;
}

function ensureEducationEntries(raw: unknown): EducationEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (item !== null && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      return {
        school: typeof o.school === 'string' ? o.school : undefined,
        degree: typeof o.degree === 'string' ? o.degree : undefined,
        year: typeof o.year === 'string' ? o.year : undefined,
        ...o,
      } as EducationEntry;
    }
    return {} as EducationEntry;
  });
}

function ensureExperienceEntries(raw: unknown): ExperienceEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (item !== null && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      const bullets = Array.isArray(o.bullets)
        ? (o.bullets as unknown[]).filter((b): b is string => typeof b === 'string')
        : undefined;
      return {
        title: typeof o.title === 'string' ? o.title : undefined,
        company: typeof o.company === 'string' ? o.company : undefined,
        location: typeof o.location === 'string' ? o.location : undefined,
        dates: typeof o.dates === 'string' ? o.dates : undefined,
        bullets,
        ...o,
      } as ExperienceEntry;
    }
    return {} as ExperienceEntry;
  });
}

function ensureSkills(raw: unknown): unknown[] | Record<string, string[]> {
  if (Array.isArray(raw)) {
    const asObjects = raw.every(
      (x) => x !== null && typeof x === 'object' && 'category' in x && 'keywords' in x
    );
    if (asObjects && raw.length > 0) {
      const obj: Record<string, string[]> = {};
      for (const item of raw as Array<{ category?: string; keywords?: unknown }>) {
        const cat = typeof item.category === 'string' ? item.category : 'Skills';
        const kw = Array.isArray(item.keywords)
          ? (item.keywords as unknown[]).filter((k): k is string => typeof k === 'string')
          : [];
        obj[cat] = kw;
      }
      return obj;
    }
    return raw;
  }
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, string[]>;
  }
  return [];
}

/**
 * Extracts a structured Profile from resume text by calling an LLM.
 * Input is plain text; PDF-to-text (or pasted text) is the caller's responsibility.
 *
 * @param resumeText - Full or truncated resume text
 * @param options - Optional apiKey, model (default gpt-4o-mini), baseURL
 * @returns Profile with education, experience, and skills coerced to the correct shapes
 * @throws If OPENAI_API_KEY (or options.apiKey) is missing, or if the LLM response is not valid JSON
 */
export async function extractProfileFromResumeText(
  resumeText: string,
  options?: ExtractProfileFromResumeOptions
): Promise<Profile> {
  const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'extractProfileFromResumeText requires OPENAI_API_KEY (or pass apiKey in options).'
    );
  }

  const openaiOptions: { apiKey: string; baseURL?: string } = { apiKey };
  if (options?.baseURL) openaiOptions.baseURL = options.baseURL;
  const client = new OpenAI(openaiOptions);
  const model = options?.model ?? DEFAULT_MODEL;

  const truncated =
    resumeText.length > MAX_RESUME_CHARS
      ? resumeText.slice(0, MAX_RESUME_CHARS) + '\n\n[Truncated...]'
      : resumeText;
  const USER_PROMPT = `Extract structured profile data from the following resume.

Resume Text:
"""
${truncated}
"""`
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: USER_PROMPT },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "profile_schema",
        strict: true,
        schema: PROFILE_SCHEMA,
      },
    },
    temperature: 0.2,
  });

  const raw = completion.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error('extractProfileFromResumeText: LLM returned empty response.');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    throw new Error(
      `extractProfileFromResumeText: LLM response was not valid JSON. ${(e as Error).message}`
    );
  }

  const profile: Profile = {
    ...parsed,
    name: typeof parsed.name === 'string' ? parsed.name : undefined,
    email: typeof parsed.email === 'string' ? parsed.email : undefined,
    phone: typeof parsed.phone === 'string' ? parsed.phone : undefined,
    linkedin: typeof parsed.linkedin === 'string' ? parsed.linkedin : undefined,
    summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
    education: ensureEducationEntries(parsed.education),
    experience: ensureExperienceEntries(parsed.experience),
    skills: ensureSkills(parsed.skills),
  };

  return profile;
}
