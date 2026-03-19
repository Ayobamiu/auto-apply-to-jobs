/**
 * Orchestrates the full dynamic form pipeline:
 * Extract → Classify → Generate Answers → Store
 *
 * Called during the probe or pre-apply phase to prepare form data.
 */
import type { Page, Locator } from 'playwright';
import { getSiteAdapter } from './site-adapter-registry.js';
import { classifyAllFields } from './field-classifier.js';
import { generateAnswers, questionHash } from './answer-generator.js';
import {
  getApplicationForm,
  upsertApplicationForm,
  getAllSavedAnswers as fetchAllSavedAnswers,
  getExtendedProfile,
} from '../../data/application-forms.js';
import { getProfile } from '../../data/profile.js';
import { computeExtractionMetrics, logExtractionMetrics } from './analytics.js';
import type {
  ApplicationFormRecord,
  GeneratedAnswer,
  NormalizedFormSchema,
  ClassifiedField,
  Job,
} from '../types.js';

export interface ProcessDynamicFormOptions {
  page: Page;
  modalLocator: Locator;
  jobRef: string;
  site: string;
  userId: string;
  job?: Job;
  /** When true, skip extraction and reuse existing stored form schema. */
  reuseExisting?: boolean;
}

export interface ProcessDynamicFormResult {
  schema: NormalizedFormSchema;
  classifiedFields: ClassifiedField[];
  answers: GeneratedAnswer[];
  hasDynamicFields: boolean;
  formRecord: ApplicationFormRecord;
}

/**
 * Run the full dynamic form extraction pipeline for a job.
 * Returns the classified fields and generated answers, also persists to DB.
 */
export async function processDynamicForm(
  options: ProcessDynamicFormOptions,
): Promise<ProcessDynamicFormResult> {
  const { page, modalLocator, jobRef, site, userId, job, reuseExisting } = options;

  let schema: NormalizedFormSchema;
  let classifiedFields: ClassifiedField[];

  // Check for existing stored form
  if (reuseExisting) {
    const existing = await getApplicationForm(userId, jobRef);
    if (existing) {
      schema = existing.schema;
      classifiedFields = existing.classifiedFields;

      // Re-generate answers in case profile changed
      const [profile, extendedProfile, savedAnswers] = await Promise.all([
        getProfile(userId),
        getExtendedProfile(userId),
        fetchAllSavedAnswers(userId),
      ]);

      const answers = await generateAnswers({
        classifiedFields,
        profile,
        extendedProfile,
        savedAnswers,
        job,
      });

      const formRecord: ApplicationFormRecord = {
        ...existing,
        answers,
        status: existing.status === 'submitted' ? 'submitted' : 'draft',
      };

      await upsertApplicationForm(formRecord);

      const hasDynamicFields = classifiedFields.some(
        (f) => f.fieldType !== 'file_upload',
      );

      return { schema, classifiedFields, answers, hasDynamicFields, formRecord };
    }
  }

  // Extract fields from the live page using the appropriate site adapter
  const adapter = getSiteAdapter(site);
  if (!adapter) {
    console.warn(`[dynamic-form] No adapter registered for site "${site}", falling back to empty schema.`);
    return {
      schema: { jobRef, site, extractedAt: new Date().toISOString(), fields: [] },
      classifiedFields: [],
      answers: [],
      hasDynamicFields: false,
      formRecord: { userId, jobRef, site, schema: { jobRef, site, extractedAt: new Date().toISOString(), fields: [] }, classifiedFields: [], answers: [], status: 'draft' },
    };
  }
  console.log(`[dynamic-form] Extracting form fields using ${site} adapter...`);
  const extractResult = await adapter.extractForm(page, modalLocator, jobRef);
  schema = extractResult.schema;

  // Classify (async: includes LLM fallback for low-confidence fields)
  console.log(`[dynamic-form] Classifying ${schema.fields.length} fields...`);
  classifiedFields = await classifyAllFields(schema.fields);
  for (const f of classifiedFields) {
    console.log(`  [${f.intent}] (${(f.confidence * 100).toFixed(0)}%) ${f.rawLabel} (${f.fieldType})`);
  }

  // Generate answers
  const [profile, extendedProfile, savedAnswers] = await Promise.all([
    getProfile(userId),
    getExtendedProfile(userId),
    fetchAllSavedAnswers(userId),
  ]);

  const answers = await generateAnswers({
    classifiedFields,
    profile,
    extendedProfile,
    savedAnswers,
    job,
  });

  const hasDynamicFields = classifiedFields.some(
    (f) => f.fieldType !== 'file_upload',
  );

  console.log(`[dynamic-form] Generated ${answers.length} answers, ${hasDynamicFields ? 'has' : 'no'} dynamic fields.`);

  const hasWrittenDoc = classifiedFields.some(
    (f) => f.intent === 'upload_other_document' && f.rawInstructions,
  );
  const metrics = computeExtractionMetrics(userId, jobRef, site, classifiedFields, answers, hasWrittenDoc);
  logExtractionMetrics(metrics);

  // Persist
  const formRecord: ApplicationFormRecord = {
    userId,
    jobRef,
    site,
    schema,
    classifiedFields,
    answers,
    status: 'draft',
  };
  await upsertApplicationForm(formRecord);

  return { schema, classifiedFields, answers, hasDynamicFields, formRecord };
}
