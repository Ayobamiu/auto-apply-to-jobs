/**
 * Answer generation pipeline.
 * Three-tier generation: profile data → saved answers → LLM (for open-ended / unknown).
 */
import { createHash } from 'crypto';
import OpenAI from 'openai';
import type {
  ClassifiedField,
  GeneratedAnswer,
  FieldIntent,
  Profile,
  ExtendedProfileFields,
  SavedAnswer,
  Job,
} from '../types.js';

export function questionHash(label: string): string {
  return createHash('sha256').update(label.toLowerCase().trim()).digest('hex').slice(0, 16);
}

// ── Confidence thresholds ────────────────────────────────────────────────
const CONFIDENCE_AUTO = 0.9;
const CONFIDENCE_REVIEW = 0.7;

function needsReview(classificationConfidence: number, mappingConfidence: number): boolean {
  const combined = classificationConfidence * mappingConfidence;
  return combined < CONFIDENCE_AUTO;
}

// ── Profile data extraction by intent ────────────────────────────────────

type ProfileResolver = (
  profile: Profile,
  extended: ExtendedProfileFields,
  field: ClassifiedField,
  job?: Job,
) => { value: string | string[]; confidence: number } | null;

const PROFILE_RESOLVERS: Partial<Record<FieldIntent, ProfileResolver>> = {
  phone: (p) => p.phone ? { value: p.phone, confidence: 1.0 } : null,
  email: (p) => p.email ? { value: p.email, confidence: 1.0 } : null,
  full_name: (p) => p.name ? { value: p.name, confidence: 1.0 } : null,
  linkedin_url: (p) => p.linkedin ? { value: p.linkedin, confidence: 1.0 } : null,
  website_url: (_p, ext) => ext.website ? { value: ext.website, confidence: 0.95 } : null,
  github_url: (p, ext) => {
    const gh = (p as Record<string, unknown>).github as string | undefined || ext.github;
    return gh ? { value: gh, confidence: 0.95 } : null;
  },

  work_authorization: (_p, ext, field) => {
    if (!ext.work_authorization) return null;
    const matchingOption = findBestOption(field, ext.work_authorization);
    return matchingOption ? { value: matchingOption, confidence: 0.85 } : null;
  },

  visa_sponsorship: (_p, ext, field) => {
    if (ext.requires_visa_sponsorship === undefined) return null;
    const target = ext.requires_visa_sponsorship ? 'yes' : 'no';
    const matchingOption = findBestOption(field, target);
    return matchingOption ? { value: matchingOption, confidence: 0.85 } : null;
  },

  relocation_willingness: (_p, ext, field) => {
    if (ext.willing_to_relocate === undefined) return null;
    const target = ext.willing_to_relocate ? 'yes' : 'no';
    const matchingOption = findBestOption(field, target);
    return matchingOption ? { value: matchingOption, confidence: 0.8 } : null;
  },

  degree_status: (p, ext, field) => {
    if (ext.current_degree_status) {
      const match = findBestOption(field, ext.current_degree_status);
      if (match) return { value: match, confidence: 0.85 };
    }
    if (p.education?.length) {
      const latest = p.education[0];
      if (latest.degree) {
        const match = findBestOption(field, latest.degree);
        if (match) return { value: match, confidence: 0.7 };
      }
    }
    return null;
  },

  referral_source: (_p, ext, field) => {
    if (!ext.referral_source) {
      const match = findBestOption(field, 'Job Board');
      return match ? { value: match, confidence: 0.7 } : null;
    }
    const match = findBestOption(field, ext.referral_source);
    return match ? { value: match, confidence: 0.85 } : null;
  },

  referral_details: () => {
    return { value: 'Handshake', confidence: 0.8 };
  },

  data_sharing_consent: (_p, _ext, field) => {
    const yesOption = findBestOption(field, 'yes');
    return yesOption ? { value: yesOption, confidence: 0.8 } : null;
  },

  // EEO fields: use saved preferences or default to "decline"
  eeo_gender: (_p, ext, field) => {
    if (ext.eeo_gender) {
      const match = findBestOption(field, ext.eeo_gender);
      if (match) return { value: match, confidence: 0.9 };
    }
    const decline = findBestOption(field, 'decline');
    return decline ? { value: decline, confidence: 0.7 } : null;
  },
  eeo_race: (_p, ext, field) => {
    if (ext.eeo_race) {
      const match = findBestOption(field, ext.eeo_race);
      if (match) return { value: match, confidence: 0.9 };
    }
    const decline = findBestOption(field, 'decline');
    return decline ? { value: decline, confidence: 0.7 } : null;
  },
  eeo_veteran_status: (_p, ext, field) => {
    if (ext.eeo_veteran_status) {
      const match = findBestOption(field, ext.eeo_veteran_status);
      if (match) return { value: match, confidence: 0.9 };
    }
    const decline = findBestOption(field, "don't wish");
    if (decline) return { value: decline, confidence: 0.7 };
    const declineAlt = findBestOption(field, 'decline');
    return declineAlt ? { value: declineAlt, confidence: 0.7 } : null;
  },
  eeo_disability: (_p, ext, field) => {
    if (ext.eeo_disability_status) {
      const match = findBestOption(field, ext.eeo_disability_status);
      if (match) return { value: match, confidence: 0.9 };
    }
    const decline = findBestOption(field, "don't want");
    if (decline) return { value: decline, confidence: 0.7 };
    const declineAlt = findBestOption(field, 'do not want');
    return declineAlt ? { value: declineAlt, confidence: 0.7 } : null;
  },

  // ── Education fields ──────────────────────────────────────────────────────

  school_name: (p, _ext, field) => {
    const school = p.education?.[0]?.school;
    if (!school) return null;
    const match = findBestOption(field, school);
    return match ? { value: match, confidence: 0.9 } : { value: school, confidence: 0.9 };
  },

  degree_name: (p, _ext, field) => {
    const degree = p.education?.[0]?.degree;
    if (!degree) return null;
    const match = findBestOption(field, degree);
    return match ? { value: match, confidence: 0.85 } : { value: degree, confidence: 0.85 };
  },

  discipline_name: (p, _ext, field) => {
    // discipline is often embedded in the degree string e.g. "B.S. Computer Science"
    const degree = p.education?.[0]?.degree;
    if (!degree) return null;
    const match = findBestOption(field, degree);
    return match ? { value: match, confidence: 0.75 } : { value: degree, confidence: 0.75 };
  },

  // ── Shared date fields (edu + company) ───────────────────────────────────

  start_month: (p, _ext, _field) => {
    // job arg signals company context; fall back to education
    const month = p.education?.[0]?.startMonth;
    return month ? { value: String(month), confidence: 0.7 } : null;
  },

  start_year: (p, _ext, _field) => {
    const year = p.education?.[0]?.startYear;
    return year ? { value: String(year), confidence: 0.8 } : null;
  },

  end_month: (p, _ext, _field) => {
    // For education, try expected_graduation first
    const month = p.education?.[0]?.endMonth;
    return month ? { value: String(month), confidence: 0.85 } : null;
  },

  end_year: (p, _ext, _field) => {
    const year = p.education?.[0]?.endYear;
    return year ? { value: String(year), confidence: 0.85 } : null;
  },

  // ── Company / experience fields ──────────────────────────────────────────

  company_name: (p, _ext, _field) => {
    const company = p.experience?.[0]?.company;
    return company ? { value: company, confidence: 0.95 } : null;
  },

  title: (p, _ext, _field) => {
    const title = p.experience?.[0]?.title;
    return title ? { value: title, confidence: 0.95 } : null;
  },


};

/**
 * Find the best matching option value for a field given a target string.
 * Uses case-insensitive substring matching on option labels.
 */
function findBestOption(field: ClassifiedField, target: string): string | null {
  if (!field.options?.length) return target;
  const lower = target.toLowerCase();
  // Exact match first
  const exact = field.options.find((o) => o.label.toLowerCase() === lower);
  if (exact) return exact.value;
  // Substring match
  const partial = field.options.find((o) => o.label.toLowerCase().includes(lower));
  if (partial) return partial.value;
  // Reverse substring (target contains option label)
  const reverse = field.options.find((o) => lower.includes(o.label.toLowerCase()));
  if (reverse) return reverse.value;
  return null;
}

// ── LLM answer generation (tier 3) ───────────────────────────────────────

const LLM_ELIGIBLE_INTENTS: FieldIntent[] = [
  'screening_open_ended', 'screening_yes_no', 'unknown',
];

async function generateAnswerWithLLM(
  field: ClassifiedField,
  profile: Profile,
  job?: Job,
): Promise<{ value: string; confidence: number } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const client = new OpenAI({ apiKey });

  const optionsText = field.options?.length
    ? `Available options: ${field.options.map((o) => o.label).join(', ')}\nYou MUST choose one of these exact option labels.`
    : '';

  const jobBlock = [
    job?.title && `Title: ${job.title}`,
    job?.company && `Company: ${job.company}`,
    job?.description && `Description: ${job.description.slice(0, 4000)}`,
  ].filter(Boolean).join('\n');

  const profileBlock = JSON.stringify({
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    summary: profile.summary,
    education: profile.education,
    experience: profile.experience,
  }, null, 2);

  const prompt = `Answer this job application question for the candidate.

Question: "${field.rawLabel}"
Field type: ${field.fieldType}
${field.rawInstructions ? `Instructions: ${field.rawInstructions}` : ''}
${optionsText}

Candidate profile:
${profileBlock}

Job:
${jobBlock}

Rules:
- If there are options listed, respond with EXACTLY one of the option labels.
- For yes/no questions, lean towards the answer that helps the candidate.
- For open-ended questions, write a concise, genuine 1-3 sentence response.
- For select fields, pick the most relevant option.
- Output ONLY the answer value, nothing else.`;

  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 200,
    });
    const text = completion.choices?.[0]?.message?.content?.trim();
    if (!text) return null;

    // For fields with options, verify the LLM picked a valid one
    if (field.options?.length) {
      const match = findBestOption({ ...field } as ClassifiedField, text);
      if (match) return { value: match, confidence: 0.7 };
      return { value: text, confidence: 0.5 };
    }

    return { value: text, confidence: 0.65 };
  } catch (err) {
    console.warn('[answer-gen] LLM generation failed:', (err as Error).message);
    return null;
  }
}

// ── Main answer generation ───────────────────────────────────────────────

export interface GenerateAnswersInput {
  classifiedFields: ClassifiedField[];
  profile: Profile;
  extendedProfile: ExtendedProfileFields;
  savedAnswers: SavedAnswer[];
  job?: Job;
}

/**
 * Generate prefilled answers for all classified fields.
 * Tries: profile data → saved answers → LLM (for eligible intents) → marks as unknown.
 */
export async function generateAnswers(input: GenerateAnswersInput): Promise<GeneratedAnswer[]> {
  const { classifiedFields, profile, extendedProfile, savedAnswers, job } = input;

  const savedByIntent = new Map<string, SavedAnswer>();
  const savedByHash = new Map<string, SavedAnswer>();
  for (const sa of savedAnswers) {
    if (sa.questionHash) {
      savedByHash.set(`${sa.intent}::${sa.questionHash}`, sa);
    } else {
      savedByIntent.set(sa.intent, sa);
    }
  }

  const results: GeneratedAnswer[] = [];

  for (const field of classifiedFields) {
    // Skip file uploads - they're handled by the existing pipeline
    if (field.fieldType === 'file_upload') {
      results.push({
        fieldId: field.id,
        intent: field.intent,
        value: '',
        source: 'default_rule',
        confidence: field.confidence,
        requiresReview: false,
      });
      continue;
    }

    // 1. Try profile data resolver
    const resolver = PROFILE_RESOLVERS[field.intent];
    if (resolver) {
      const result = resolver(profile, extendedProfile, field, job);
      if (result && result.value) {
        results.push({
          fieldId: field.id,
          intent: field.intent,
          value: result.value,
          source: 'profile',
          confidence: field.confidence * result.confidence,
          requiresReview: needsReview(field.confidence, result.confidence),
        });
        continue;
      }
    }

    // 2. Try saved answer (exact question hash first, then by intent)
    const qHash = questionHash(field.rawLabel);
    const savedExact = savedByHash.get(`${field.intent}::${qHash}`);
    if (savedExact) {
      results.push({
        fieldId: field.id,
        intent: field.intent,
        value: savedExact.answerValue,
        source: 'saved_answer',
        confidence: field.confidence * 0.85,
        requiresReview: needsReview(field.confidence, 0.85),
      });
      continue;
    }
    const savedGeneric = savedByIntent.get(field.intent);
    if (savedGeneric) {
      results.push({
        fieldId: field.id,
        intent: field.intent,
        value: savedGeneric.answerValue,
        source: 'saved_answer',
        confidence: field.confidence * 0.75,
        requiresReview: true,
      });
      continue;
    }

    // 3. LLM fallback for eligible intents (open-ended, yes/no, unknown)
    if (LLM_ELIGIBLE_INTENTS.includes(field.intent) || field.intent === 'unknown') {
      const llmResult = await generateAnswerWithLLM(field, profile, job);
      if (llmResult) {
        results.push({
          fieldId: field.id,
          intent: field.intent,
          value: llmResult.value,
          source: 'ai_generated',
          confidence: field.confidence * llmResult.confidence,
          requiresReview: true,
        });
        continue;
      }
    }

    // 4. Unknown - leave blank, require user input
    results.push({
      fieldId: field.id,
      intent: field.intent,
      value: '',
      source: 'default_rule',
      confidence: field.confidence * 0.3,
      requiresReview: true,
    });
  }

  return results;
}
