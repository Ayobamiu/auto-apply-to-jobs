/**
 * LLM-based check for hard requirement mismatches between profile and job.
 * Warns only; does not block the apply.
 */
import OpenAI from 'openai';
import type { Profile, Job, JobProfileMismatchResult } from './types.js';

export type { JobProfileMismatchResult } from './types.js';

const DEFAULT_MODEL = 'gpt-4o-mini';

const SYSTEM_PROMPT = `You compare a candidate profile with a job description to identify HARD requirements the candidate does not satisfy.

Focus ONLY on clear, non-negotiable requirements such as:
- Veteran status (e.g. "veterans only", "military veterans preferred")
- Work authorization (e.g. "must be authorized to work in the US", "no sponsorship")
- Degree requirements (e.g. "Bachelor's required", "PhD preferred")
- Years of experience (e.g. "5+ years required", "minimum 3 years")
- Specific certifications or licenses

Return JSON with this exact shape:
{
  "hasMismatch": boolean,
  "reason": string | null,
  "severity": "info" | "warning" | "blocker" | null,
  "requiresConfirmation": boolean | null
}

- hasMismatch: true only if there is a CLEAR, HARD requirement the profile does not satisfy
- reason: ONE concise sentence explaining the mismatch (no more than ~200 characters), or null if no mismatch
- severity:
  - "blocker" for serious, high-risk mismatches (e.g. not work-authorized, missing required degree, far below required years of experience, or explicit eligibility like "US citizens only" not met)
  - "warning" for notable but less severe mismatches
  - "info" for mild caveats we should show only if helpful
- requiresConfirmation: true when the mismatch is serious enough that the assistant should ask the user before proceeding to apply (typically when severity is "blocker")

Do NOT flag:
- Soft preferences ("preferred", "nice to have")
- Vague requirements
- Skills that might be implied by experience
- Missing optional fields`;

export async function checkJobProfileMismatch(
  profile: Profile,
  job: Job
): Promise<JobProfileMismatchResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { hasMismatch: false };
  }

  try {
    const client = new OpenAI({ apiKey });
    const profileStr = JSON.stringify(profile, null, 2);
    const jobDesc = (job.description ?? '').slice(0, 8000);
    const jobTitle = job.title ?? 'Job';
    const jobCompany = job.company ?? '';

    const completion = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Profile:\n${profileStr}\n\nJob: ${jobTitle} at ${jobCompany}\n\nJob description:\n${jobDesc}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) return { hasMismatch: false };

    const parsed = JSON.parse(raw) as {
      hasMismatch?: boolean;
      reason?: string | null;
      severity?: string | null;
      requiresConfirmation?: boolean | null;
    };

    const hasMismatch = parsed.hasMismatch === true;

    let reason: string | undefined;
    if (hasMismatch && typeof parsed.reason === 'string' && parsed.reason.trim()) {
      const trimmed = parsed.reason.trim();
      reason = trimmed.length > 200 ? `${trimmed.slice(0, 197)}…` : trimmed;
    }

    let severity: JobProfileMismatchResult['severity'];
    if (hasMismatch && typeof parsed.severity === 'string') {
      const sev = parsed.severity.toLowerCase();
      if (sev === 'info' || sev === 'warning' || sev === 'blocker') {
        severity = sev;
      }
    }
    if (hasMismatch && !severity) {
      severity = 'warning';
    }

    let requiresConfirmation: boolean | undefined;
    if (hasMismatch && typeof parsed.requiresConfirmation === 'boolean') {
      requiresConfirmation = parsed.requiresConfirmation;
    } else if (hasMismatch && severity === 'blocker') {
      requiresConfirmation = true;
    }

    return { hasMismatch, reason, severity, requiresConfirmation };
  } catch {
    return { hasMismatch: false };
  }
}
