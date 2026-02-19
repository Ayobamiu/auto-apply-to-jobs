/**
 * Resume assistant: profile + job (+ optional conversation) → JSON Resume.
 * Separate from JSON→PDF so we can add conversational editing later.
 * Uses an LLM to tailor the resume to the job; returns a single JSON Resume object.
 */
import OpenAI from 'openai';

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

/**
 * Build user message from profile + job. For future conversational use, messages can be prepended.
 * @param {object} profile - Candidate profile (name, email, experience, education, skills, etc.)
 * @param {object} job - Job (title, company, description)
 * @returns {{ role: 'user', content: string }}
 */
function buildUserMessage(profile, job) {
  const jobBlock = job?.title || job?.company || job?.description
    ? `\n\n## Target job\nTitle: ${job?.title || 'N/A'}\nCompany: ${job?.company || 'N/A'}\n\nDescription:\n${(job?.description || '').slice(0, 8000)}`
    : '';
  const profileJson = JSON.stringify(profile, null, 2);
  return {
    role: 'user',
    content: `Generate a tailored resume (JSON Resume format only) from this candidate profile and target job. Output a single JSON object, no other text.\n\n## Candidate profile\n${profileJson}${jobBlock}`,
  };
}

/**
 * Call the LLM and parse JSON from the response. Uses OpenAI-compatible API.
 * @param {object} params
 * @param {object} params.profile - Candidate profile
 * @param {object} params.job - Job (title, company, description)
 * @param {Array<{ role: string, content: string }>} [params.messages] - Optional prior messages for future conversational editing
 * @param {string} [params.apiKey] - OpenAI API key (default: process.env.OPENAI_API_KEY)
 * @param {string} [params.model] - Model (default: gpt-4o-mini)
 * @param {string} [params.baseURL] - Optional base URL for API (e.g. for proxies)
 * @returns {Promise<object>} JSON Resume document
 */
export async function generateResumeWithAssistant({ profile, job = {}, messages = [], apiKey, model = DEFAULT_MODEL, baseURL }) {
  const key = apiKey ?? process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('Resume assistant requires OPENAI_API_KEY (or pass apiKey in options).');
  }

  const openaiOptions = { apiKey: key };
  if (baseURL) openaiOptions.baseURL = baseURL;

  const client = new OpenAI(openaiOptions);

  const userMessage = buildUserMessage(profile, job);
  const chatMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages,
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

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Resume assistant: LLM response was not valid JSON. ${e.message}`);
  }

  if (!parsed.basics) {
    parsed.basics = { ...parsed.basics, name: profile.name, email: profile.email };
  }
  if (!parsed.$schema) {
    parsed.$schema = SCHEMA_URL;
  }

  return parsed;
}
