/**
 * Two-tier field intent classifier:
 * 1. Rule-based (fast, no tokens) — matches label, type, options, selectors.
 * 2. LLM fallback (OpenAI) — for fields where rule confidence < threshold.
 */
import OpenAI from 'openai';
import type {
  NormalizedFormField,
  ClassifiedField,
  FieldIntent,
} from '../types.js';

const LLM_CONFIDENCE_THRESHOLD = 0.7;

interface ClassificationRule {
  intent: FieldIntent;
  confidence: number;
  match: (f: NormalizedFormField) => boolean;
}

const label = (f: NormalizedFormField) => f.rawLabel.toLowerCase();
const selName = (f: NormalizedFormField) => (f.selectors.fileInputName || '').toLowerCase();
const hasOption = (f: NormalizedFormField, pattern: RegExp) =>
  f.options?.some((o) => pattern.test(o.label)) ?? false;

const RULES: ClassificationRule[] = [
  // ── Document uploads ──
  {
    intent: 'upload_resume',
    confidence: 0.95,
    match: (f) => f.fieldType === 'file_upload' && (/resume/i.test(f.rawLabel) || /resume/i.test(selName(f))),
  },
  {
    intent: 'upload_cover_letter',
    confidence: 0.95,
    match: (f) => f.fieldType === 'file_upload' && (/cover\s*letter/i.test(f.rawLabel) || /coverletter/i.test(selName(f))),
  },
  {
    intent: 'upload_transcript',
    confidence: 0.95,
    match: (f) => f.fieldType === 'file_upload' && (/transcript/i.test(f.rawLabel) || /transcript/i.test(selName(f))),
  },
  {
    intent: 'upload_other_document',
    confidence: 0.85,
    match: (f) => f.fieldType === 'file_upload' && !/resume|cover|transcript/i.test(f.rawLabel),
  },

  // ── Contact / profile ──
  {
    intent: 'phone',
    confidence: 0.95,
    match: (f) => f.fieldType === 'text' && /\bphone\b/i.test(f.rawLabel),
  },
  {
    intent: 'email',
    confidence: 0.95,
    match: (f) => f.fieldType === 'text' && /\bemail\b/i.test(f.rawLabel) && !/hear|about/i.test(f.rawLabel),
  },
  {
    intent: 'full_name',
    confidence: 0.9,
    match: (f) => f.fieldType === 'text' && /\b(full\s*name|your\s*name)\b/i.test(f.rawLabel),
  },
  {
    intent: 'linkedin_url',
    confidence: 0.95,
    match: (f) => f.fieldType === 'text' && /linkedin/i.test(f.rawLabel),
  },
  {
    intent: 'website_url',
    confidence: 0.9,
    match: (f) => f.fieldType === 'text' && /\bwebsite\b/i.test(f.rawLabel) && !/linkedin|github/i.test(f.rawLabel),
  },
  {
    intent: 'github_url',
    confidence: 0.9,
    match: (f) => f.fieldType === 'text' && /github/i.test(f.rawLabel),
  },
  {
    intent: 'address',
    confidence: 0.85,
    match: (f) => f.fieldType === 'text' && /\b(address|street|city|zip|postal)\b/i.test(f.rawLabel),
  },

  // ── Work authorization ──
  {
    intent: 'work_authorization',
    confidence: 0.95,
    match: (f) =>
      (f.fieldType === 'select' || f.fieldType === 'radio') &&
      /legally\s*authorized|work\s*authori[zs]/i.test(f.rawLabel),
  },
  {
    intent: 'visa_sponsorship',
    confidence: 0.95,
    match: (f) =>
      (f.fieldType === 'select' || f.fieldType === 'radio') &&
      /visa|sponsorship/i.test(f.rawLabel),
  },
  {
    intent: 'relocation_willingness',
    confidence: 0.9,
    match: (f) =>
      (f.fieldType === 'radio' || f.fieldType === 'select') &&
      /relocat/i.test(f.rawLabel),
  },
  {
    intent: 'availability_start_date',
    confidence: 0.85,
    match: (f) =>
      (f.fieldType === 'select' || f.fieldType === 'multi_select' || f.fieldType === 'text') &&
      /\b(start\s*date|internship\s*date|available|availability)\b/i.test(f.rawLabel),
  },

  // ── Education ──
  {
    intent: 'degree_status',
    confidence: 0.9,
    match: (f) =>
      (f.fieldType === 'select' || f.fieldType === 'radio') &&
      /degree/i.test(f.rawLabel) &&
      (hasOption(f, /pursuing/i) || hasOption(f, /received/i) || hasOption(f, /bachelor|master|phd|bs|ba|ms/i)),
  },
  {
    intent: 'graduation_date',
    confidence: 0.85,
    match: (f) => f.fieldType === 'text' && /graduat/i.test(f.rawLabel),
  },
  {
    intent: 'major',
    confidence: 0.85,
    match: (f) => f.fieldType === 'text' && /\bmajor\b/i.test(f.rawLabel),
  },
  {
    intent: 'gpa',
    confidence: 0.9,
    match: (f) => f.fieldType === 'text' && /\bgpa\b/i.test(f.rawLabel),
  },

  // ── EEO (voluntary) ──
  {
    intent: 'eeo_gender',
    confidence: 0.95,
    match: (f) =>
      (f.fieldType === 'select' || f.fieldType === 'radio') &&
      /\bgender\b/i.test(f.rawLabel) &&
      f.sectionCategory === 'eeo',
  },
  {
    intent: 'eeo_gender',
    confidence: 0.85,
    match: (f) =>
      (f.fieldType === 'select' || f.fieldType === 'radio') &&
      f.selectors.inputSelector.includes('gender'),
  },
  {
    intent: 'eeo_race',
    confidence: 0.95,
    match: (f) =>
      (f.fieldType === 'select' || f.fieldType === 'radio') &&
      /\brace\b/i.test(f.rawLabel),
  },
  {
    intent: 'eeo_race',
    confidence: 0.85,
    match: (f) =>
      (f.fieldType === 'select' || f.fieldType === 'radio') &&
      f.selectors.inputSelector.includes('race'),
  },
  {
    intent: 'eeo_veteran_status',
    confidence: 0.95,
    match: (f) =>
      (f.fieldType === 'select' || f.fieldType === 'radio') &&
      /veteran/i.test(f.rawLabel),
  },
  {
    intent: 'eeo_veteran_status',
    confidence: 0.85,
    match: (f) =>
      (f.fieldType === 'select' || f.fieldType === 'radio') &&
      f.selectors.inputSelector.includes('veteran'),
  },
  {
    intent: 'eeo_disability',
    confidence: 0.95,
    match: (f) =>
      (f.fieldType === 'select' || f.fieldType === 'radio') &&
      /disabilit/i.test(f.rawLabel),
  },
  {
    intent: 'eeo_disability',
    confidence: 0.85,
    match: (f) =>
      (f.fieldType === 'select' || f.fieldType === 'radio') &&
      f.selectors.inputSelector.includes('disability'),
  },

  // ── Referral ──
  {
    intent: 'referral_source',
    confidence: 0.9,
    match: (f) =>
      (f.fieldType === 'select' || f.fieldType === 'text') &&
      /how\s*did\s*you\s*hear/i.test(f.rawLabel),
  },
  {
    intent: 'referral_details',
    confidence: 0.85,
    match: (f) =>
      f.fieldType === 'text' &&
      /specify|details.*answer\s*above|referr/i.test(f.rawLabel),
  },

  // ── Data sharing consent ──
  {
    intent: 'data_sharing_consent',
    confidence: 0.9,
    match: (f) =>
      f.fieldType === 'radio' &&
      /share.*data|education\s*data|improve.*chances/i.test(f.rawLabel),
  },

  // ── Screening questions (generic yes/no) ──
  {
    intent: 'screening_yes_no',
    confidence: 0.75,
    match: (f) =>
      f.fieldType === 'radio' &&
      f.options?.length === 2 &&
      hasOption(f, /^yes$/i) &&
      hasOption(f, /^no$/i) &&
      // Exclude intents already matched above
      !/relocat|authori[zs]|visa|sponsor|share.*data/i.test(f.rawLabel),
  },

  // ── California residents notice ──
  {
    intent: 'screening_open_ended',
    confidence: 0.7,
    match: (f) =>
      f.fieldType === 'select' &&
      /california\s*resident/i.test(f.rawLabel),
  },
];

/**
 * Classify a single field using rule-based matching.
 * Returns the highest-confidence matching rule, or 'unknown'.
 */
export function classifyField(field: NormalizedFormField): ClassifiedField {
  let bestIntent: FieldIntent = 'unknown';
  let bestConfidence = 0;

  for (const rule of RULES) {
    if (rule.match(field) && rule.confidence > bestConfidence) {
      bestIntent = rule.intent;
      bestConfidence = rule.confidence;
    }
  }

  return {
    ...field,
    intent: bestIntent,
    confidence: bestConfidence,
  };
}

const VALID_INTENTS: FieldIntent[] = [
  'upload_resume', 'upload_cover_letter', 'upload_transcript', 'upload_other_document',
  'phone', 'email', 'full_name', 'linkedin_url', 'website_url', 'github_url', 'address',
  'degree_status', 'graduation_date', 'school_name', 'major', 'gpa',
  'work_authorization', 'visa_sponsorship', 'relocation_willingness', 'availability_start_date', 'availability_schedule',
  'eeo_gender', 'eeo_race', 'eeo_veteran_status', 'eeo_disability',
  'screening_yes_no', 'screening_open_ended',
  'referral_source', 'referral_details', 'data_sharing_consent', 'unknown',
];

/**
 * LLM-based fallback classifier for fields that the rule engine can't confidently classify.
 */
async function classifyFieldWithLLM(field: NormalizedFormField): Promise<{ intent: FieldIntent; confidence: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { intent: 'unknown', confidence: 0 };
  }

  const client = new OpenAI({ apiKey });

  const optionsText = field.options?.length
    ? `Options: ${field.options.map((o) => o.label).join(', ')}`
    : '';
  const instructionsText = field.rawInstructions ? `Instructions: ${field.rawInstructions}` : '';
  const sectionText = field.sectionHeading ? `Section: ${field.sectionHeading}` : '';

  const prompt = `Classify this job application form field into one of these intents:
${VALID_INTENTS.join(', ')}

Field details:
- Label: "${field.rawLabel}"
- Type: ${field.fieldType}
- Required: ${field.required}
${sectionText}
${optionsText}
${instructionsText}

Respond with ONLY a JSON object: {"intent": "<intent>", "confidence": <0.0-1.0>}`;

  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 60,
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() ?? '';
    const parsed = JSON.parse(raw) as { intent: string; confidence: number };
    const intent = VALID_INTENTS.includes(parsed.intent as FieldIntent)
      ? (parsed.intent as FieldIntent)
      : 'unknown';
    const confidence = typeof parsed.confidence === 'number'
      ? Math.min(Math.max(parsed.confidence, 0), 1)
      : 0.6;

    return { intent, confidence };
  } catch (err) {
    console.warn('[classifier] LLM fallback failed:', (err as Error).message);
    return { intent: 'unknown', confidence: 0 };
  }
}

/**
 * Classify all fields: rule-based first, then LLM fallback for low-confidence results.
 */
export async function classifyAllFields(fields: NormalizedFormField[]): Promise<ClassifiedField[]> {
  const results: ClassifiedField[] = [];

  for (const field of fields) {
    const ruleBased = classifyField(field);

    if (ruleBased.confidence >= LLM_CONFIDENCE_THRESHOLD) {
      results.push(ruleBased);
      continue;
    }

    // LLM fallback for low-confidence or unknown fields
    const llmResult = await classifyFieldWithLLM(field);
    if (llmResult.confidence > ruleBased.confidence) {
      results.push({
        ...field,
        intent: llmResult.intent,
        confidence: llmResult.confidence,
      });
      console.log(`  [llm-classifier] ${field.rawLabel} → ${llmResult.intent} (${(llmResult.confidence * 100).toFixed(0)}%)`);
    } else {
      results.push(ruleBased);
    }
  }

  return results;
}
