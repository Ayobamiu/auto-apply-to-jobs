/**
 * Resume assistant: profile + job (+ optional conversation) → JSON Resume.
 * Uses an LLM to tailor the resume to the job.
 */
import OpenAI from 'openai';
import { AppError, CODES } from '../../shared/errors.js';
import type { Profile, Job } from '../../shared/types.js';

const SCHEMA_URL = 'https://raw.githubusercontent.com/jsonresume/resume-schema/master/schema.json';

const DEFAULT_MODEL = 'gpt-4o-mini';

const SYSTEM_PROMPT = `You are a resume writer. Your task is to produce a single JSON object that conforms to the JSON Resume schema (https://jsonresume.org/schema/).

Output only valid JSON with no markdown or explanation. The JSON must include:
- $schema: "${SCHEMA_URL}"
- basics: { name, label, email?, phone?, url?, summary, location?: { region? }, profiles?: [{ network, url }] }
- work: array of { name (company), position, location?, startDate?, endDate?, summary?, highlights: string[] }
- education: array of { institution, area, studyType?, startDate?, endDate? }
- skills: array of { name (category), keywords: string[] }
- projects?: array of { name, description?, highlights?: string[] }

Use ISO8601-ish dates where possible (e.g. "2025-05", "2025"). Keep the candidate's facts accurate; tailor emphasis, summary, and ordering to the job.`;

function buildUserMessage(profile: Profile, job: Job): { role: 'user'; content: string } {
  const jobBlock =
    job?.title || job?.company || job?.description
      ? `\n\n## Target job\nTitle: ${job?.title || 'N/A'}\nCompany: ${job?.company || 'N/A'}\n\nDescription:\n${(job?.description || '').slice(0, 8000)}`
      : '';
  const profileJson = JSON.stringify(profile, null, 2);
  return {
    role: 'user',
    content: `Generate a tailored resume (JSON Resume format only) from this candidate profile and target job. Output a single JSON object, no other text.\n\n## Candidate profile\n${profileJson}${jobBlock}`,
  };
}

export interface GenerateResumeWithAssistantParams {
  profile: Profile;
  job?: Job;
  messages?: Array<{ role: string; content: string }>;
  apiKey?: string;
  model?: string;
  baseURL?: string;
}

export async function generateResumeWithAssistant({
  profile,
  job = {},
  messages = [],
  apiKey,
  model = DEFAULT_MODEL,
  baseURL,
}: GenerateResumeWithAssistantParams): Promise<Record<string, unknown>> {
  const key = apiKey ?? process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('Resume assistant requires OPENAI_API_KEY (or pass apiKey in options).');
  }

  const openaiOptions: { apiKey: string; baseURL?: string } = { apiKey: key };
  if (baseURL) openaiOptions.baseURL = baseURL;

  const client = new OpenAI(openaiOptions);

  const userMessage = buildUserMessage(profile, job as Job);
  const chatMessages: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages.map((m) => ({ role: m.role as 'user', content: m.content })),
    userMessage,
  ];

  const completion = await client.chat.completions.create({
    model,
    messages: chatMessages,
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const raw = completion.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error('Resume assistant received empty response from LLM.');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`Resume assistant: LLM response was not valid JSON. ${(e as Error).message}`);
  }

  if (!parsed.basics) {
    parsed.basics = { ...(parsed.basics as object), name: profile.name, email: profile.email };
  }
  if (!parsed.$schema) {
    parsed.$schema = SCHEMA_URL;
  }

  return parsed;
}

const EDIT_SYSTEM_PROMPT = `You are a resume editor. You will receive the current resume as JSON (JSON Resume schema) and a user request. Apply the requested changes and return the complete updated resume as a single JSON object only. No markdown, no explanation. Preserve all fields not affected by the request. The JSON must remain valid JSON Resume format.`;

export interface UpdateResumeFromChatOptions {
  apiKey?: string;
  model?: string;
  baseURL?: string;
}

export async function updateResumeFromChat(
  resumeJson: Record<string, unknown>,
  userMessage: string,
  options: UpdateResumeFromChatOptions = {}
): Promise<Record<string, unknown>> {
  const key = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!key) {
    throw new AppError(CODES.MISSING_API_KEY);
  }

  const openaiOptions: { apiKey: string; baseURL?: string } = { apiKey: key };
  if (options.baseURL) openaiOptions.baseURL = options.baseURL;

  const client = new OpenAI(openaiOptions);
  const model = options.model ?? DEFAULT_MODEL;

  const content = `${JSON.stringify(resumeJson, null, 2)}\n\nUser request: ${userMessage}`;

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: EDIT_SYSTEM_PROMPT },
      { role: 'user', content },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const raw = completion.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error('Resume edit received empty response from LLM.');
  }

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`Resume edit: LLM response was not valid JSON. ${(e as Error).message}`);
  }
}
