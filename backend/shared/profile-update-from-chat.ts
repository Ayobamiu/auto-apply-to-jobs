/**
 * Extract profile updates from conversational user messages using an LLM.
 */
import OpenAI from 'openai';
import type { Profile } from './types.js';

const DEFAULT_MODEL = 'gpt-4o-mini';

const SYSTEM_PROMPT = `You extract profile updates from a user's message.

Given the current profile and the user's message, return a JSON object with ONLY the fields to add or update.
Supported fields: name, email, phone, linkedin, summary, veteran, armyStatus, education, experience, skills, and any other profile-relevant fields.

Rules:
- Return ONLY valid JSON. No explanations.
- Only include fields the user explicitly wants to add or change.
- For skills: if adding one skill, merge with existing (e.g. add to skills array or object).
- For veteran/armyStatus: extract from phrases like "I'm a veteran", "army status: veteran", "add my veteran status".
- If the message does not clearly specify a profile update, return {}.
- Do NOT overwrite name or email with empty strings.
- Preserve structure: education and experience are arrays; skills can be array or object.`;

export async function extractProfileUpdateFromMessage(
  profile: Profile,
  message: string
): Promise<Partial<Profile>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {};
  }

  try {
    const client = new OpenAI({ apiKey });
    const profileStr = JSON.stringify(profile, null, 2);
    const truncated = message.slice(0, 2000);

    const completion = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Current profile:\n${profileStr}\n\nUser message: "${truncated}"\n\nReturn JSON with only the fields to update:`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) return {};

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    // Reject empty name/email overwrites
    const result: Partial<Profile> = { ...parsed };
    if (result.name === '' || result.name === null) delete result.name;
    if (result.email === '' || result.email === null) delete result.email;

    return result;
  } catch {
    return {};
  }
}
