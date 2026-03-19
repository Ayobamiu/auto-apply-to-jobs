/**
 * API routes for dynamic application forms:
 * GET  /application-forms/:jobRef         — get form + answers for a job
 * PUT  /application-forms/:jobRef/answers — update answers
 * POST /application-forms/:jobRef/review  — mark form as reviewed (ready to submit)
 * GET  /saved-answers                     — list all saved answers for user
 * PUT  /saved-answers                     — save/update an answer
 * GET  /profile/extended                  — get extended profile fields
 * PUT  /profile/extended                  — update extended profile fields
 */
import type { Request, Response } from 'express';
import {
  getApplicationForm,
  updateApplicationFormAnswers,
  updateApplicationFormStatus,
  getAllSavedAnswers,
  upsertSavedAnswer,
  getExtendedProfile,
  updateExtendedProfile,
} from '../../data/application-forms.js';
import { questionHash } from '../../shared/form-extraction/answer-generator.js';
import { logReviewMetrics } from '../../shared/form-extraction/analytics.js';
import type { GeneratedAnswer, FieldIntent, ExtendedProfileFields } from '../../shared/types.js';

const SAVE_WORTHY_INTENTS: FieldIntent[] = [
  'referral_source', 'referral_details', 'screening_yes_no', 'screening_open_ended',
  'data_sharing_consent', 'eeo_gender', 'eeo_race', 'eeo_veteran_status', 'eeo_disability',
  'work_authorization', 'visa_sponsorship', 'relocation_willingness', 'availability_start_date',
];

async function writeSavedAnswersFromReview(userId: string, jobRef: string, answers: GeneratedAnswer[]): Promise<void> {
  const form = await getApplicationForm(userId, jobRef);
  if (!form) return;

  const fieldMap = new Map(form.classifiedFields.map((f) => [f.id, f]));

  for (const answer of answers) {
    if (!answer.value || (Array.isArray(answer.value) && answer.value.length === 0)) continue;
    if (answer.source === 'default_rule') continue;

    const field = fieldMap.get(answer.fieldId);
    if (!field || field.fieldType === 'file_upload') continue;

    if (SAVE_WORTHY_INTENTS.includes(field.intent) || answer.source === 'user_manual') {
      const value = Array.isArray(answer.value) ? answer.value.join(', ') : answer.value;
      const qHash = questionHash(field.rawLabel);
      try {
        await upsertSavedAnswer(userId, field.intent, value, qHash);
      } catch {
        // Non-fatal
      }
    }
  }
}

// ── Application forms ────────────────────────────────────────────────────

export async function getApplicationFormHandler(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const jobRef = req.params.jobRef as string;
  if (!jobRef) { res.status(400).json({ error: 'Missing jobRef' }); return; }

  const form = await getApplicationForm(userId, jobRef);
  if (!form) {
    res.status(404).json({ error: 'No form found for this job' });
    return;
  }

  res.status(200).json({
    id: form.id,
    jobRef: form.jobRef,
    site: form.site,
    schema: form.schema,
    classifiedFields: form.classifiedFields,
    answers: form.answers,
    status: form.status,
    createdAt: form.createdAt,
    updatedAt: form.updatedAt,
  });
}

export async function putApplicationFormAnswers(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const jobRef = req.params.jobRef as string;
  if (!jobRef) { res.status(400).json({ error: 'Missing jobRef' }); return; }

  const { answers } = req.body as { answers?: GeneratedAnswer[] };
  if (!Array.isArray(answers)) {
    res.status(400).json({ error: 'Body must include answers array' });
    return;
  }

  await updateApplicationFormAnswers(userId, jobRef, answers, 'draft');
  res.status(200).json({ ok: true });
}

export async function postApplicationFormReview(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const jobRef = req.params.jobRef as string;
  if (!jobRef) { res.status(400).json({ error: 'Missing jobRef' }); return; }

  const { answers } = req.body as { answers?: GeneratedAnswer[] };
  if (Array.isArray(answers)) {
    await updateApplicationFormAnswers(userId, jobRef, answers, 'reviewed');
    writeSavedAnswersFromReview(userId, jobRef, answers).catch(() => { });

    const form = await getApplicationForm(userId, jobRef);
    if (form) {
      const dynamicFields = form.classifiedFields.filter((f) => f.fieldType !== 'file_upload');
      const edited = answers.filter((a) => a.source === 'user_manual').length;
      logReviewMetrics({
        userId,
        jobRef,
        fieldsEdited: edited,
        fieldsAccepted: dynamicFields.length - edited,
        totalFields: dynamicFields.length,
      });
    }
  } else {
    await updateApplicationFormStatus(userId, jobRef, 'reviewed');
  }
  res.status(200).json({ ok: true });
}

// ── Per-field AI helpers ──────────────────────────────────────────────────

export async function postGenerateFieldAnswer(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const jobRef = req.params.jobRef as string;
  if (!jobRef) { res.status(400).json({ error: 'Missing jobRef' }); return; }

  const { fieldId } = req.body as { fieldId?: string };
  if (!fieldId) { res.status(400).json({ error: 'Missing fieldId' }); return; }

  const form = await getApplicationForm(userId, jobRef);
  if (!form) { res.status(404).json({ error: 'No form found for this job' }); return; }

  const field = form.classifiedFields.find((f) => f.id === fieldId);
  if (!field) { res.status(404).json({ error: 'Field not found' }); return; }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'OpenAI API key not configured' }); return; }

  const { getProfile } = await import('../../data/profile.js');
  const { getJob } = await import('../../data/jobs.js');
  const { getJobIdFromUrl, getJobSiteFromUrl } = await import('../../shared/job-from-url.js');

  const profile = await getProfile(userId);
  const parts = jobRef.split(':');
  const site = parts[0] ?? '';
  const jid = parts.slice(1).join(':') ?? '';
  const job = (site && jid) ? await getJob(site, jid) : undefined;

  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey });

  const optionsText = field.options?.length
    ? `Available options: ${field.options.map((o) => o.label).join(', ')}\nYou MUST choose one of these exact option labels.`
    : '';

  const jobBlock = [
    job?.title && `Title: ${job.title}`,
    job?.company && `Company: ${job.company}`,
    job?.description && `Description: ${job.description.slice(0, 4000)}`,
  ].filter(Boolean).join('\n');

  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `Answer this job application question for the candidate.\n\nQuestion: "${field.rawLabel}"\nField type: ${field.fieldType}\n${field.rawInstructions ? `Instructions: ${field.rawInstructions}` : ''}\n${optionsText}\n\nCandidate profile:\n${JSON.stringify({ name: profile.name, email: profile.email, summary: profile.summary, experience: profile.experience, education: profile.education }, null, 2)}\n\nJob:\n${jobBlock}\n\nRules:\n- If there are options, pick the best one and respond with EXACTLY that option label.\n- For open-ended questions, write a concise 1-3 sentence response.\n- Output ONLY the answer value.`,
      }],
      temperature: 0.3,
      max_tokens: 300,
    });

    const text = completion.choices?.[0]?.message?.content?.trim() ?? '';
    res.status(200).json({
      fieldId,
      value: text,
      source: 'ai_generated',
      confidence: 0.7,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message ?? 'AI generation failed' });
  }
}

export async function postAiEditFieldAnswer(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const jobRef = req.params.jobRef as string;
  if (!jobRef) { res.status(400).json({ error: 'Missing jobRef' }); return; }

  const { fieldId, currentValue, instruction } = req.body as {
    fieldId?: string;
    currentValue?: string;
    instruction?: string;
  };
  if (!fieldId || !instruction) {
    res.status(400).json({ error: 'Missing fieldId or instruction' });
    return;
  }

  const form = await getApplicationForm(userId, jobRef);
  if (!form) { res.status(404).json({ error: 'No form found for this job' }); return; }

  const field = form.classifiedFields.find((f) => f.id === fieldId);
  if (!field) { res.status(404).json({ error: 'Field not found' }); return; }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'OpenAI API key not configured' }); return; }

  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey });

  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `Edit this job application answer per the instruction.\n\nQuestion: "${field.rawLabel}"\nCurrent answer: "${currentValue ?? ''}"\nInstruction: ${instruction}\n\nOutput ONLY the revised answer text.`,
      }],
      temperature: 0.3,
      max_tokens: 300,
    });

    const text = completion.choices?.[0]?.message?.content?.trim() ?? '';
    res.status(200).json({
      fieldId,
      value: text,
      source: 'ai_generated',
      confidence: 0.7,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message ?? 'AI edit failed' });
  }
}

// ── Saved answers ────────────────────────────────────────────────────────

export async function getSavedAnswersHandler(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const answers = await getAllSavedAnswers(userId);
  res.status(200).json(answers);
}

export async function putSavedAnswerHandler(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const { intent, answerValue, questionHash } = req.body as {
    intent?: FieldIntent;
    answerValue?: string;
    questionHash?: string;
  };
  if (!intent || !answerValue) {
    res.status(400).json({ error: 'Missing intent or answerValue' });
    return;
  }

  await upsertSavedAnswer(userId, intent, answerValue, questionHash);
  res.status(200).json({ ok: true });
}

// ── Extended profile ─────────────────────────────────────────────────────

export async function getExtendedProfileHandler(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const extended = await getExtendedProfile(userId);
  res.status(200).json(extended);
}

export async function putExtendedProfileHandler(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const fields = req.body as Partial<ExtendedProfileFields>;
  if (!fields || typeof fields !== 'object') {
    res.status(400).json({ error: 'Body must be an object of extended profile fields' });
    return;
  }

  await updateExtendedProfile(userId, fields);
  res.status(200).json({ ok: true });
}
