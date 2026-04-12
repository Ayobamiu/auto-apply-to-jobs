/**
 * Resume assistant: profile + job (+ optional conversation) → JSON Resume.
 * Uses an LLM to tailor the resume to the job.
 */
import OpenAI from 'openai';
import { AppError, CODES } from '../../shared/errors.js';
import type { Profile, Job } from '../../shared/types.js';

const DEFAULT_MODEL = 'gpt-4o-mini';

const LIST_UNIQUENESS_RULES = `
## List uniqueness (required)
- Every array (work, education, projects, volunteer, awards, certificates, publications, languages, skills, interests, references, basics.profiles) must list each real-world entry at most once.
- Do not repeat identical jobs, degrees, projects, credentials, or profile links. If tailoring, merge duplicates—never copy the same block many times.
- For skills: one object per category name; put all related keywords in that single object.`;

function buildUserMessage(
  profile: Profile,
  job: Job,
  baseResumeJson?: Record<string, unknown>
): { role: 'user'; content: string } {
  const jobBlock =
    job?.title || job?.company || job?.description
      ? `\n\n## Target job\nTitle: ${job?.title || 'N/A'}\nCompany: ${job?.company || 'N/A'}\n\nDescription:\n${(job?.description || '').slice(0, 8000)}`
      : '';
  if (baseResumeJson && Object.keys(baseResumeJson).length > 0) {
    const resumeJson = JSON.stringify(baseResumeJson, null, 2);
    return {
      role: 'user',
      content: `Tailor this candidate's resume (JSON Resume format) to the target job. Output a single JSON object only. Preserve all factual content; reorder, rephrase summary/highlights, and emphasize what fits the job.${LIST_UNIQUENESS_RULES}\n\n## Current resume (JSON)\n${resumeJson}${jobBlock}`,
    };
  }
  const profileJson = JSON.stringify(profile, null, 2);
  return {
    role: 'user',
    content: `Generate a tailored resume (JSON Resume format only) from this candidate profile and target job. Output a single JSON object, no other text.${LIST_UNIQUENESS_RULES}\n\n## Candidate profile\n${profileJson}${jobBlock}`,
  };
}

export type { GenerateResumeWithAssistantParams, UpdateResumeFromChatOptions } from '../../shared/types.js';
import type { GenerateResumeWithAssistantParams, UpdateResumeFromChatOptions } from '../../shared/types.js';
import { resume_from_text_or_pdf_response_format, resume_from_text_or_pdf_system_prompt } from '../../shared/prompts/resume.js';

export async function generateResumeWithAssistant({
  profile,
  baseResumeJson,
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

  const userMessage = buildUserMessage(profile, job as Job, baseResumeJson);
  const chatMessages: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: resume_from_text_or_pdf_system_prompt },
    ...messages.map((m) => ({ role: m.role as 'user', content: m.content })),
    userMessage,
  ];

  const completion = await client.chat.completions.create({
    model,
    messages: chatMessages,
    response_format: resume_from_text_or_pdf_response_format,
    temperature: 0.3,
  });

  const raw = completion.choices[0].message.content;
  if (!raw) {
    throw new Error('Resume assistant received empty response from LLM.');
  }

  return JSON.parse(raw) as Record<string, unknown>;
}

const EDIT_SYSTEM_PROMPT = `You are a resume editor. You will receive the current resume as JSON (JSON Resume schema) and a user request. Apply the requested changes and return the complete updated resume as a single JSON object only. No markdown, no explanation. Preserve all fields not affected by the request. The JSON must remain valid JSON Resume format.

Never duplicate list entries: work, education, projects, volunteer, awards, certificates, publications, languages, skills, interests, references, and basics.profiles must each contain at most one object per distinct real-world item. If the resume already has duplicates, remove extras and keep the best single row per item.`;

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
