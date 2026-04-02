/**
 * Greenhouse job hydration: fetches full job content + form questions from the
 * Greenhouse boards API, updates DB with description, and pre-extracts form fields
 * so they're ready before the user clicks Apply.
 */
import { pool } from '../api/db.js';
import { updateJob, getJob } from '../data/jobs.js';
import type { GreenhouseJob } from '../types/jobs.js';
import type { ApplicationFormRecord, ClassifiedField, GeneratedAnswer, NormalizedFormField, NormalizedFormSchema, } from '../shared/types.js';
import { classifyAllFields } from '../shared/form-extraction/field-classifier.js';
import {
  upsertApplicationForm,
  getAllSavedAnswers,
  getExtendedProfile,
  getApplicationForm,
} from '../data/application-forms.js';
import { getProfile } from '../data/profile.js';
import { generateAnswers } from '../shared/form-extraction/answer-generator.js';

interface GreenhouseQuestionField {
  name: string;
  type: string;
  values?: { value: number | string; label: string }[];
}

interface GreenhouseQuestion {
  required: boolean;
  label: string;
  fields: GreenhouseQuestionField[];
}

interface GreenhouseDemographicOption {
  id: number;
  label: string;
  free_form: boolean;
}

interface GreenhouseDemographicQuestion {
  id: number;
  label: string;
  required: boolean;
  type: string;
  answer_options: GreenhouseDemographicOption[];
}

interface GreenhouseJobFull extends GreenhouseJob {
  content?: string;
  questions?: GreenhouseQuestion[];
  location_questions?: GreenhouseQuestion[];
  compliance?: GreenhouseQuestion[];
  demographic_questions?: {
    header: string;
    description: string;
    questions: GreenhouseDemographicQuestion[];
  };
  education: string | null;
  [key: string]: unknown;
}

export interface HydrateResult {
  description: string | null;
  content: string | null;
  alreadyHydrated: boolean;
  formFields: NormalizedFormField[];
  education: string | null;
}

function stripHtml(html: string): string {
  return html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ghFieldTypeToNormalized(ghType: string): NormalizedFormField['fieldType'] {
  switch (ghType) {
    case 'input_file': return 'file_upload';
    case 'input_text': return 'text';
    case 'input_hidden': return 'text';
    case 'textarea': return 'textarea';
    case 'multi_value_single_select': return 'select';
    case 'multi_value_multi_select': return 'multi_select';
    default: return 'text';
  }
}

function convertQuestionsToFields(
  questions: GreenhouseQuestion[],
  startIndex: number,
): NormalizedFormField[] {
  const fields: NormalizedFormField[] = [];
  let idx = startIndex;

  for (const q of questions) {
    if (q?.fields && q?.fields?.length > 0) {
      for (const f of q.fields) {
        if (f.type === 'input_hidden') continue;

        const fieldType = ghFieldTypeToNormalized(f.type);
        const options = f.values?.map((v) => ({
          value: String(v.value),
          label: v.label,
        })) ?? [];

        fields.push({
          id: f.name || `gh_field_${idx}`,
          rawLabel: q.label,
          fieldType,
          required: q.required,
          options,
          selectors: {
            inputSelector: `[name="${f.name}"]`,
          },
        });
        idx++;
      }
    }
  }

  return fields;
}

function convertDemographicQuestions(
  demo: GreenhouseJobFull['demographic_questions'],
  startIndex: number,
): NormalizedFormField[] {
  if (!demo?.questions) return [];
  const fields: NormalizedFormField[] = [];
  let idx = startIndex;

  for (const q of demo.questions) {
    const fieldType = q.type === 'multi_value_multi_select' ? 'multi_select' : 'select';
    const options = q.answer_options.map((o) => ({
      value: String(o.id),
      label: o.label,
    }));

    fields.push({
      id: `demographic_${q.id}`,
      rawLabel: q.label,
      fieldType,
      required: q.required,
      options,
      selectors: {
        inputSelector: `[data-demographic-question-id="${q.id}"]`,
      },
    });
    idx++;
  }

  return fields;
}

export async function getGreenhouseSlugForJob(jobId: string): Promise<string | null> {
  try {
    const res = await pool.query<{ greenhouse_slug: string }>(
      `SELECT greenhouse_slug FROM jobs WHERE site = 'greenhouse' AND job_id = $1`,
      [jobId],
    );
    return res.rows[0]?.greenhouse_slug ?? null;
  } catch {
    return null;
  }
}

export async function hydrateGreenhouseJob(jobId: string, userId: string, processAnswers: boolean = true): Promise<void> {
  try {
    const job = await getJob('greenhouse', jobId);
    // if (job?.description && job.description.length > 100) {
    //   return;
    // }
    const resolvedSlug = await getGreenhouseSlugForJob(jobId);
    if (!resolvedSlug) {
      return;
    }

    const jobRef = `greenhouse:${jobId}`;

    //If formFields Already Exists, use existing formFields
    let classifiedFields: ClassifiedField[] = [];
    let education: string | null = null;
    let formFields: NormalizedFormField[] = [];
    const existingFormFields = await getApplicationForm(userId, jobRef);
    if (existingFormFields && existingFormFields.classifiedFields.length > 0) {
      console.log('[hydrate] form fields already exist');
      classifiedFields = existingFormFields.classifiedFields;
    } else {
      //https://developers.greenhouse.io/job-board.html#retrieve-a-job
      console.log('[hydrate] fetching form fields from greenhouse api');
      const res = await fetch(
        `https://boards-api.greenhouse.io/v1/boards/${resolvedSlug}/jobs/${jobId}?questions=true`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) {
        console.warn(`[hydrate] Greenhouse API returned ${res.status} for ${resolvedSlug}/${jobId}`);
        return;
      }

      const data: GreenhouseJobFull = await res.json();
      education = data.education ?? null;
      const htmlContent = data.content ?? '';
      const plainDescription = stripHtml(htmlContent);

      await updateJob('greenhouse', jobId, {
        description: plainDescription,
        title: data.title ?? undefined,
        url: data.absolute_url ?? undefined,
        location: data.location?.name ?? undefined,
      });

      let idx = 0;

      if (data.location_questions) {
        const locFields = convertQuestionsToFields(data.location_questions, idx);
        formFields.push(...locFields);
        idx += locFields.length;
      }

      if (data.questions) {
        const qFields = convertQuestionsToFields(data.questions, idx);
        formFields.push(...qFields);
        idx += qFields.length;
      }

      if (data.compliance) {
        const compFields = convertQuestionsToFields(data.compliance, idx);
        formFields.push(...compFields);
        idx += compFields.length;
      }

      if (data.demographic_questions) {
        const demoFields = convertDemographicQuestions(data.demographic_questions, idx);
        formFields.push(...demoFields);
      }
      if (formFields.length > 0) {
        classifiedFields = await classifyAllFields(formFields);
        // education is required if education: "education_required"
        if (education && education === "education_required") {
          formFields.push(...getEducationFormFields());
        }
      }
    }
    console.log({ classifiedFields: existingFormFields?.classifiedFields.length });

    // Moving answer generation logic here (conditionally based on processAnswers)
    if (classifiedFields.length > 0) {
      setImmediate(async () => {
        try {
          const schema: NormalizedFormSchema = {
            jobRef,
            site: 'greenhouse',
            extractedAt: new Date().toISOString(),
            fields: formFields,
          };
          const [profile, extendedProfile, savedAnswers] = await Promise.all([
            getProfile(userId),
            getExtendedProfile(userId),
            getAllSavedAnswers(userId),
          ]);
          let answers: GeneratedAnswer[] = [];
          if (processAnswers) {
            console.log('[hydrate] generating answers');
            answers = await generateAnswers({
              classifiedFields,
              profile,
              extendedProfile,
              savedAnswers,
              job: job ?? undefined,
            });
          }

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
    return;
  } catch (err) {
    console.warn('[hydrate] Failed to fetch greenhouse job:', (err as Error).message);
    return;
  }
}


export function getEducationFormFields(): ClassifiedField[] {
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
  return fieldsForEdu;
}

export function getCompanyFormFields(): ClassifiedField[] {
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

  return fieldsForCompany;
}