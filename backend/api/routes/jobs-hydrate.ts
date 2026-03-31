/**
 * POST /jobs/hydrate — trigger hydration for a greenhouse job.
 * Fetches full content + form questions from Greenhouse API, updates DB,
 * classifies form fields, generates answers, and stores in application_forms.
 * The goal: everything is ready before the user clicks "Apply".
 */
import type { Request, Response } from 'express';
import { hydrateGreenhouseJob } from '../../greenhouse/hydrate.js';
import { getJob } from '../../data/jobs.js';
import { classifyAllFields } from '../../shared/form-extraction/field-classifier.js';
import { generateAnswers } from '../../shared/form-extraction/answer-generator.js';
import {
  getApplicationForm,
  upsertApplicationForm,
  getAllSavedAnswers,
  getExtendedProfile,
} from '../../data/application-forms.js';
import { getProfile } from '../../data/profile.js';
import type { ApplicationFormRecord, ClassifiedField, NormalizedFormSchema } from '../../shared/types.js';

export async function postJobsHydrate(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const { jobRef } = req.body ?? {};
  if (typeof jobRef !== 'string' || !jobRef.includes(':')) {
    res.status(400).json({ error: 'jobRef is required (e.g. greenhouse:12345)' });
    return;
  }

  const i = jobRef.indexOf(':');
  const site = jobRef.slice(0, i);
  const jobId = jobRef.slice(i + 1);

  if (site !== 'greenhouse') {
    res.status(400).json({ error: 'Hydration is only supported for greenhouse jobs' });
    return;
  }

  try {
    const result = await hydrateGreenhouseJob(jobId);
    const job = await getJob('greenhouse', jobId);

    const responseJob = job ? { ...job, jobId, site: 'greenhouse' } : null;

    res.status(200).json({
      hydrated: !result.alreadyHydrated,
      job: responseJob,
      formFieldCount: result.formFields.length,
    });
    if (result.formFields.length > 0) {
      setImmediate(async () => {
        try {
          const existing = await getApplicationForm(userId, jobRef);
          if (existing && existing.classifiedFields.length > 0) return;

          const schema: NormalizedFormSchema = {
            jobRef,
            site: 'greenhouse',
            extractedAt: new Date().toISOString(),
            fields: result.formFields,
          };

          let classifiedFields = await classifyAllFields(result.formFields);
          // some forms are not included in the greenhouse api, so we need to add them manually
          // function to add manually included fields
          // education is required if education: "education_required"
          if (result.education && result.education === "education_required") {
            classifiedFields = await addManuallyIncludedFields(classifiedFields);
          }

          const [profile, extendedProfile, savedAnswers] = await Promise.all([
            getProfile(userId),
            getExtendedProfile(userId),
            getAllSavedAnswers(userId),
          ]);

          const answers = await generateAnswers({
            classifiedFields,
            profile,
            extendedProfile,
            savedAnswers,
            job: job ?? undefined,
          });

          const formRecord: ApplicationFormRecord = {
            userId,
            jobRef,
            site: 'greenhouse',
            schema,
            classifiedFields,
            answers,
            status: 'draft',
          };

          await upsertApplicationForm(formRecord);
          console.log(`[hydrate] Pre-extracted ${classifiedFields.length} fields, ${answers.length} answers for ${jobRef}`);
        } catch (err) {
          console.warn('[hydrate] Background form extraction failed:', (err as Error).message);
        }
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Hydration failed';
    res.status(500).json({ error: message });
  }
}

async function addManuallyIncludedFields(classifiedFields: ClassifiedField[]): Promise<ClassifiedField[]> {

  // fields for education
  const fieldsForEdu: ClassifiedField[] = [
    {
      id: "school--0",
      intent: "school_name",
      fieldType: "select",
      required: true,
      options: [],
      confidence: 1,
      rawLabel: "School",
      selectors: {
        inputSelector: "#school--0",
        inputName: "",
      },
    },
    {
      id: "degree--0",
      intent: "degree_name",
      fieldType: "select",
      required: true,
      options: [],
      confidence: 1,
      rawLabel: "Degree",
      selectors: {
        inputSelector: "#degree--0",
        inputName: "",
      },
    },
    {
      id: "discipline--0",
      intent: "discipline_name",
      fieldType: "select",
      required: true,
      options: [],
      confidence: 1,
      rawLabel: "Discipline",
      selectors: {
        inputSelector: "#discipline--0",
        inputName: "",
      },
    },
    {
      id: "start-month--0",
      intent: "start_month",
      fieldType: "number",
      required: true,
      confidence: 1,
      rawLabel: "Start Month",
      selectors: {
        inputSelector: "#start-month--0",
        inputName: "",
      },
    },
    {
      id: "start-year--0",
      intent: "start_year",
      fieldType: "number",
      required: true,
      confidence: 1,
      rawLabel: "Start Date",
      selectors: {
        inputSelector: "#start-year--0",
        inputName: "",
      },
    },
    {
      id: "end-year--0",
      intent: "end_year",
      fieldType: "number",
      required: true,
      confidence: 1,
      rawLabel: "End Date",
      selectors: {
        inputSelector: "#end-year--0",
        inputName: "",
      },
    },
    {
      id: "end-month--0",
      intent: "end_month",
      fieldType: "number",
      required: true,
      confidence: 1,
      rawLabel: "End Month",
      selectors: {
        inputSelector: "#end-month--0",
        inputName: "",
      },
    },
  ]

  // fields for company
  const fieldsForCompany: ClassifiedField[] = [
    {
      id: "company--0",
      intent: "company_name",
      fieldType: "text",
      required: true,
      confidence: 1,
      rawLabel: "Company",
      selectors: {
        inputSelector: "#company--0",
        inputName: "",
      },
    },
    {
      id: "title--0",
      intent: "title",
      fieldType: "text",
      required: true,
      confidence: 1,
      rawLabel: "Title",
      selectors: {
        inputSelector: "#title--0",
        inputName: "",
      },
    },
    {
      id: "start-month--0",
      intent: "start_month",
      fieldType: "number",
      required: true,
      confidence: 1,
      rawLabel: "Start Month",
      selectors: {
        inputSelector: "#start-month--0",
        inputName: "",
      },
    },
    {
      id: "start-year--0",
      intent: "start_year",
      fieldType: "number",
      required: true,
      confidence: 1,
      rawLabel: "Start Date",
      selectors: {
        inputSelector: "#start-year--0",
        inputName: "",
      },
    },
    {
      id: "end-year--0",
      intent: "end_year",
      fieldType: "number",
      required: true,
      confidence: 1,
      rawLabel: "End Date",
      selectors: {
        inputSelector: "#end-year--0",
        inputName: "",
      },
    },
    {
      id: "end-month--0",
      intent: "end_month",
      fieldType: "number",
      required: true,
      confidence: 1,
      rawLabel: "End Month",
      selectors: {
        inputSelector: "#end-month--0",
        inputName: "",
      },
    },
  ]

  return [...classifiedFields, ...fieldsForEdu,];
}