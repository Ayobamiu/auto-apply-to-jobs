/**
 * LLM-based intent classification for the chat orchestrator.
 * When OPENAI_API_KEY is set, the orchestrator uses this module; otherwise it falls back to keyword matching.
 */
import OpenAI from 'openai';
import type { Intent } from './types.js';

const DEFAULT_MODEL = 'gpt-4o-mini';
const TIMEOUT_MS = 10_000;

const VALID_INTENTS: Intent[] = [
  'connect_handshake',
  'set_profile',
  'update_profile',
  'apply',
  'check_status',
  'list_jobs',
  'find_jobs',
  'approve',
  'cancel',
  'help',
];

const SYSTEM_PROMPT = `You are an intent classifier for a job-application assistant. The user sends messages to connect Handshake, set or update their profile, apply to jobs, check status, list jobs, approve/cancel, or ask for help.

Classify the user's message into exactly ONE of these intents. Return only valid JSON, no markdown or explanation.

Intents (use these exact labels):
- connect_handshake: user wants to connect or link Handshake, use the extension, get/copy token
- set_profile: user is providing resume text or profile info to set their profile (long text, "here is my resume", "my profile", etc.)
- update_profile: user wants to change or edit their profile ("update profile", "change my email to ...")
- apply: user wants to apply to a job; message may contain a Handshake job URL
- check_status: user wants to know status of an application ("check status", "what's the status?", "how's it going?", "is it done?", "any update?")
- list_jobs: user wants to see their jobs list ("list jobs", "my jobs", "show jobs", "applied jobs")
- find_jobs: user wants to discover or find new jobs from Handshake ("find jobs", "discover jobs", "show me new jobs", "new Handshake jobs")
- approve: user confirms they want to approve and submit ("approve", "yes apply", "go ahead and apply")
- cancel: user wants to cancel ("cancel", "don't apply", "never mind")
- help: greeting, unclear, or request for help ("help", "hi", "hello", "what can you do?")

Response format: { "intent": "<exact label from list above>", "url": "<job URL if intent is apply and message contains a Handshake job URL, otherwise null>" }
If intent is not "apply", omit "url" or set it to null.`;

export interface DetectIntentFromLLMOptions {
  lastAssistantMessage?: string;
  apiKey?: string;
  model?: string;
  /** For tests: if set, skip the API call and parse this as the LLM JSON response. */
  mockResponse?: string;
}

export interface DetectIntentFromLLMResult {
  intent: Intent;
  url?: string | null;
}

function isValidIntent(s: string): s is Intent {
  return VALID_INTENTS.includes(s as Intent);
}

export async function detectIntentFromLLM(
  message: string,
  options?: DetectIntentFromLLMOptions
): Promise<DetectIntentFromLLMResult> {
  const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;

  let raw: string | undefined;
  if (options?.mockResponse !== undefined) {
    raw = options.mockResponse;
  } else {
    if (!apiKey) {
      return { intent: 'help', url: null };
    }

    const model = options?.model ?? DEFAULT_MODEL;
    const client = new OpenAI({ apiKey });
    let userContent = `Current user message: ${message}`;
    if (options?.lastAssistantMessage?.trim()) {
      userContent = `Last assistant message: ${options.lastAssistantMessage.trim()}\n\n${userContent}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const completion = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      },
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    raw = completion.choices?.[0]?.message?.content ?? undefined;
    } catch {
      clearTimeout(timeoutId);
      return { intent: 'help', url: null };
    }
  }

  try {
    if (!raw || typeof raw !== 'string') {
      return { intent: 'help', url: null };
    }

    const parsed = JSON.parse(raw) as { intent?: string; url?: string | null };
    const intentStr = typeof parsed.intent === 'string' ? parsed.intent.trim().toLowerCase() : '';
    if (!isValidIntent(intentStr)) {
      return { intent: 'help', url: null };
    }

    const url =
      intentStr === 'apply' && typeof parsed.url === 'string' && parsed.url.startsWith('http')
        ? parsed.url.trim()
        : null;

    return { intent: intentStr, url };
  } catch {
    return { intent: 'help', url: null };
  }
}
